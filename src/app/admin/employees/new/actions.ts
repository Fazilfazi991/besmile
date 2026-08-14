'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase-server';
import { isSecurityAdministratorRole, normalizeRole } from '@/lib/permission-access';
import { normalizeDateOnly } from '@/lib/employee-edit-rules';
import { normalizeGender } from '@/lib/gender';
import { employeeStatuses } from '@/lib/employee-status';
import { temporaryPasswordValidationMessage } from '@/lib/password-rules';

const operationalRoles = new Set(['chairman', 'director', 'general_manager', 'psychologist', 'intern', 'guest_sales', 'staff']);
const protectedManagementRoles = new Set(['chairman', 'director', 'general_manager', 'super_admin']);

const defaultTemporaryPassword = 'Bsmile@1234';

export type CreateEmployeeState = { error?: string; success?: string; fields?: Record<string, string> };

export async function createEmployee(_: CreateEmployeeState, form: FormData): Promise<CreateEmployeeState> {
  const fields = Object.fromEntries(['full_name', 'email', 'phone', 'gender', 'employee_code', 'department_id', 'designation', 'role', 'manager_id', 'joining_date', 'employment_type', 'status'].map((key) => [key, String(form.get(key) || '')]));
  const session = await serverSupabase();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: 'Please sign in again.', fields };
  const [profileResult, permissionResult] = await Promise.all([
    session.from('profiles').select('id,role,status').eq('id', user.id).maybeSingle(),
    session.rpc('has_permission', { permission_code: 'employees.create' }),
  ]);
  if (profileResult.error) return { error: 'Unable to verify your employee profile. Please retry.', fields };
  if (permissionResult.error) return { error: 'Unable to verify employee creation permission. Please retry.', fields };
  if (!profileResult.data || profileResult.data.status !== 'active' || !permissionResult.data) return { error: 'You do not have permission to create employees.', fields };

  const fullName = String(form.get('full_name') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const employeeCode = String(form.get('employee_code') || '').trim();
  const gender = normalizeGender(String(form.get('gender') || ''));
  const designation = String(form.get('designation') || '').trim();
  const role = normalizeRole(String(form.get('role') || 'staff'));
  const status = String(form.get('status') || 'active');
  const suppliedTemporaryPassword = String(form.get('temporary_password') || '');
  const temporaryPassword = suppliedTemporaryPassword || defaultTemporaryPassword;
  const departmentId = String(form.get('department_id') || '') || null;
  const managerId = String(form.get('manager_id') || '') || null;
  const rawJoiningDate = String(form.get('joining_date') || '');
  let joiningDate: string | null = null;
  try { joiningDate = rawJoiningDate ? normalizeDateOnly(rawJoiningDate) : null; } catch { return { error: 'Joining date must be a valid calendar date.', fields }; }
  if (!fullName || !email || !employeeCode || !gender || !departmentId || !designation || !operationalRoles.has(role)) return { error: 'Full name, email, gender, employee code, department, designation, and a valid operational role are required.', fields };
  if (!employeeStatuses.includes(status as typeof employeeStatuses[number])) return { error: 'Choose a valid employee status.', fields };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid work email address.', fields };
  const passwordValidation = temporaryPasswordValidationMessage(suppliedTemporaryPassword);
  if (passwordValidation) return { error: passwordValidation, fields };
  if (!isSecurityAdministratorRole(profileResult.data.role) && protectedManagementRoles.has(role)) return { error: 'Only a Super Admin can assign protected management roles.', fields };

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: duplicate } = await admin.from('profiles').select('id').or(`email.eq.${email},employee_code.eq.${employeeCode}`).limit(1);
  if (duplicate?.length) return { error: 'An employee with that email address or employee code already exists.', fields };
  if (managerId) {
    const { data: manager } = await admin.from('profiles').select('id,status,role').eq('id', managerId).maybeSingle();
    if (!manager || manager.status !== 'active' || !['super_admin', 'chairman', 'director', 'general_manager'].includes(manager.role)) return { error: 'Choose an active management employee as the reporting manager.', fields };
  }
  const { data: account, error: accountError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (accountError || !account.user) {
    const duplicateEmail = /already|registered|exists|unique/i.test(accountError?.message || '');
    return { error: duplicateEmail ? 'An account already exists with this email address.' : 'The employee account could not be created. Please retry.', fields };
  }
  const { error: profileError } = await admin.from('profiles').insert({
    id: account.user.id, full_name: fullName, email, employee_code: employeeCode, phone: String(form.get('phone') || '').trim() || null, gender,
    department_id: departmentId, designation, role, manager_id: managerId,
    joining_date: joiningDate, employment_type: String(form.get('employment_type') || '').trim() || null,
    status, must_change_password: true,
  });
  if (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(account.user.id);
    return { error: cleanupError ? 'The employee profile could not be created. The account needs administrator recovery.' : 'The employee profile could not be created. The account was rolled back.', fields };
  }
  await admin.from('audit_logs').insert({
    actor_id: user.id,
    action: 'employee_account_created',
    entity_type: 'profiles',
    entity_id: account.user.id,
    after_data: { role, account_creation: 'admin_created', email_confirmed: true },
  });
  revalidatePath('/admin/employees');
  return { success: suppliedTemporaryPassword ? `${fullName} can sign in immediately and must change their temporary password on first login.` : `${fullName} can sign in immediately with the default temporary password Bsmile@1234 and must change it on first login.` };
}
