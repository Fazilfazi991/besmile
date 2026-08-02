'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase-server';
import { isSecurityAdministratorRole, normalizeRole } from '@/lib/permission-access';
import { normalizeDateOnly } from '@/lib/employee-edit-rules';

const operationalRoles = new Set(['chairman', 'director', 'general_manager', 'psychologist', 'social_worker', 'intern', 'guest_sales', 'staff']);

export type CreateEmployeeState = { error?: string; success?: string };

export async function createEmployee(_: CreateEmployeeState, form: FormData): Promise<CreateEmployeeState> {
  const session = await serverSupabase();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: 'Please sign in again.' };
  const [profileResult, permissionResult] = await Promise.all([
    session.from('profiles').select('id,role,status').eq('id', user.id).maybeSingle(),
    session.rpc('has_permission', { permission_code: 'employees.create' }),
  ]);
  if (!profileResult.data || profileResult.data.status !== 'active' || !permissionResult.data) return { error: 'You do not have permission to create employees.' };

  const fullName = String(form.get('full_name') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const employeeCode = String(form.get('employee_code') || '').trim();
  const designation = String(form.get('designation') || '').trim();
  const role = normalizeRole(String(form.get('role') || 'staff'));
  const departmentId = String(form.get('department_id') || '') || null;
  const managerId = String(form.get('manager_id') || '') || null;
  const rawJoiningDate = String(form.get('joining_date') || '');
  let joiningDate: string | null = null;
  try { joiningDate = rawJoiningDate ? normalizeDateOnly(rawJoiningDate) : null; } catch { return { error: 'Joining date must be a valid calendar date.' }; }
  if (!fullName || !email || !employeeCode || !departmentId || !designation || !operationalRoles.has(role)) return { error: 'Full name, email, employee code, department, designation, and a valid operational role are required.' };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid work email address.' };
  if (role === 'super_admin' || (!isSecurityAdministratorRole(profileResult.data.role) && role === 'super_admin')) return { error: 'Only a Super Admin can assign the Super Admin role.' };

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: duplicate } = await admin.from('profiles').select('id').or(`email.eq.${email},employee_code.eq.${employeeCode}`).limit(1);
  if (duplicate?.length) return { error: 'An employee with that email address or employee code already exists.' };
  if (managerId) {
    const { data: manager } = await admin.from('profiles').select('id,status,role').eq('id', managerId).maybeSingle();
    if (!manager || manager.status !== 'active' || !['super_admin', 'chairman', 'director', 'general_manager'].includes(manager.role)) return { error: 'Choose an active management employee as the reporting manager.' };
  }
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invitation.user) return { error: inviteError?.message || 'The employee invitation could not be created.' };
  const { error: profileError } = await admin.from('profiles').insert({
    id: invitation.user.id, full_name: fullName, email, employee_code: employeeCode, phone: String(form.get('phone') || '').trim() || null,
    department_id: departmentId, designation, role, manager_id: managerId,
    joining_date: joiningDate, employment_type: String(form.get('employment_type') || '').trim() || null,
    status: form.get('status') === 'inactive' ? 'inactive' : 'active',
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(invitation.user.id);
    return { error: profileError.message };
  }
  revalidatePath('/admin/employees');
  return { success: `${fullName} was created and invited to set their password.` };
}
