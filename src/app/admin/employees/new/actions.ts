'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { serverSupabase } from '@/lib/supabase-server';
import { isSecurityAdministratorRole, normalizeRole } from '@/lib/permission-access';
import { normalizeDateOnly } from '@/lib/employee-edit-rules';
import { normalizeGender } from '@/lib/gender';
import { employeeStatuses } from '@/lib/employee-status';

const operationalRoles = new Set(['chairman', 'director', 'general_manager', 'psychologist', 'intern', 'guest_sales', 'staff']);
const protectedManagementRoles = new Set(['chairman', 'director', 'general_manager', 'super_admin']);

export type CreateEmployeeState = { error?: string; success?: string; fields?: Record<string, string> };

async function findProvisioningUser(admin: any, email: string, requestId: string) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user: any) => user.email?.toLowerCase() === email);
    // Only administrator-controlled metadata can prove that this Auth account
    // belongs to the provisioning attempt. user_metadata is user-editable.
    if (match) return match.app_metadata?.employee_provision_request_id === requestId ? match : null;
    if (data.users.length < 200) break;
  }
  return undefined;
}

export async function createEmployee(_: CreateEmployeeState, form: FormData): Promise<CreateEmployeeState> {
  const fields = Object.fromEntries(['full_name', 'work_email', 'login_email', 'phone', 'gender', 'employee_code', 'department_id', 'designation', 'role', 'manager_id', 'joining_date', 'employment_type', 'status', 'provisioning_request_id'].map((key) => [key, String(form.get(key) || '')]));
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
  const workEmail = String(form.get('work_email') || '').trim().toLowerCase();
  const loginEmail = String(form.get('login_email') || '').trim().toLowerCase();
  const provisioningRequestId = String(form.get('provisioning_request_id') || '').trim();
  const employeeCode = String(form.get('employee_code') || '').trim();
  const gender = normalizeGender(String(form.get('gender') || ''));
  const designation = String(form.get('designation') || '').trim();
  const role = normalizeRole(String(form.get('role') || 'staff'));
  const status = String(form.get('status') || 'active');
  const departmentId = String(form.get('department_id') || '') || null;
  const managerId = String(form.get('manager_id') || '') || null;
  const rawJoiningDate = String(form.get('joining_date') || '');
  let joiningDate: string | null = null;
  try { joiningDate = rawJoiningDate ? normalizeDateOnly(rawJoiningDate) : null; } catch { return { error: 'Joining date must be a valid calendar date.', fields }; }
  if (!fullName || !workEmail || !loginEmail || !employeeCode || !gender || !departmentId || !designation || !operationalRoles.has(role)) return { error: 'Full name, work email, login email, gender, Official ID, department, designation, and a valid operational role are required.', fields };
  if (!employeeStatuses.includes(status as typeof employeeStatuses[number])) return { error: 'Choose a valid employee status.', fields };
  if (!/^\S+@\S+\.\S+$/.test(workEmail)) return { error: 'Enter a valid work email address.', fields };
  if (!/^\S+@\S+\.\S+$/.test(loginEmail)) return { error: 'Enter a valid login email address.', fields };
  if (!/^[a-zA-Z0-9._:-]{12,128}$/.test(provisioningRequestId)) return { error: 'The employee form expired. Reload it and try again.', fields };
  if (!isSecurityAdministratorRole(profileResult.data.role) && protectedManagementRoles.has(role)) return { error: 'Only a Super Admin can assign protected management roles.', fields };

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const initialPassword = process.env.EMPLOYEE_INITIAL_PASSWORD;
  if (!initialPassword) return { error: 'Employee account provisioning is not configured. Contact a system administrator.', fields };
  const { data: duplicate } = await admin.from('profiles')
    .select('id,full_name,email,work_email,employee_code,department_id,designation,role,manager_id,joining_date,employment_type,status,onboarding_required,employee_provision_request_id')
    .or(`email.eq.${loginEmail},employee_code.eq.${employeeCode}`).limit(1);
  if (duplicate?.length) {
    const completedRequest = duplicate[0];
    if (completedRequest.employee_provision_request_id !== provisioningRequestId) return { error: 'An employee with that login email address or Official ID already exists.', fields };
    const unchanged = completedRequest.full_name === fullName
      && completedRequest.email?.toLowerCase() === loginEmail
      && completedRequest.work_email?.toLowerCase() === workEmail
      && completedRequest.employee_code === employeeCode
      && completedRequest.department_id === departmentId
      && completedRequest.designation === designation
      && completedRequest.role === role
      && completedRequest.manager_id === managerId
      && completedRequest.joining_date === joiningDate
      && completedRequest.employment_type === (String(form.get('employment_type') || '').trim() || null)
      && completedRequest.status === status;
    if (!unchanged) return { error: 'This employee form submission was already used with different details. Reload the form before trying again.', fields };
    if (completedRequest.onboarding_required) {
      const existingAuth = await admin.auth.admin.getUserById(completedRequest.id);
      if (existingAuth.error || !existingAuth.data.user) return { error: 'Unable to reconcile the authentication account. Retry shortly.', fields };
      if (existingAuth.data.user.app_metadata?.employee_provision_request_id !== provisioningRequestId) {
        const recovered = await admin.auth.admin.updateUserById(completedRequest.id, {
          password: initialPassword,
          email_confirm: true,
          app_metadata: {
            ...existingAuth.data.user.app_metadata,
            employee_provision_request_id: provisioningRequestId,
            onboarding_required: true,
          },
        });
        if (recovered.error) return { error: 'The employee profile is reserved, but account setup is incomplete. Retry this same form.', fields };
      }
    }
    revalidatePath('/admin/employees');
    return { success: `${fullName} was already created. They must complete password onboarding before using the workspace.` };
  }
  if (managerId) {
    const { data: manager } = await admin.from('profiles').select('id,status,role,is_employee,workforce_visible,removed_at').eq('id', managerId).maybeSingle();
    if (!manager || manager.status !== 'active' || manager.removed_at || !((manager.is_employee && manager.workforce_visible) || ['chairman', 'director'].includes(manager.role))) return { error: 'Choose an active employee as the reporting manager.', fields };
  }
  const { data: department, error: departmentError } = await session.from('departments').select('id').eq('id', departmentId).eq('is_active', true).maybeSingle();
  if (departmentError || !department) return { error: 'Choose an active department.', fields };
  const profileInsert = {
    full_name: fullName, email: loginEmail, work_email: workEmail, employee_code: employeeCode,
    phone: String(form.get('phone') || '').trim() || null, gender, department_id: departmentId,
    designation, role, manager_id: managerId, joining_date: joiningDate,
    employment_type: String(form.get('employment_type') || '').trim() || null,
    status, onboarding_required: true, employee_provision_request_id: provisioningRequestId,
  };
  let authUser: any;
  // Staff use the configured initial credential and mandatory password onboarding.
  // Create this authorized account directly so provisioning does not depend on
  // delivery of an invitation that would immediately be auto-confirmed anyway.
  const { data: creation, error: creationError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: initialPassword,
    email_confirm: true,
    app_metadata: { employee_provision_request_id: provisioningRequestId, onboarding_required: true },
  });
  if (creation?.user) {
    authUser = creation.user;
  } else {
    try { authUser = await findProvisioningUser(admin, loginEmail, provisioningRequestId); }
    catch { return { error: 'Unable to reconcile the authentication account. Retry shortly.', fields }; }
    if (!authUser) return { error: creationError?.message || 'That login email already belongs to another account.', fields };
  }
  const metadataUpdate = await admin.auth.admin.updateUserById(authUser.id, {
    password: initialPassword,
    // This account belongs to this authorized employee creation request. Keep
    // global confirmation enabled; confirm only when provisioning its password.
    email_confirm: true,
    app_metadata: { ...authUser.app_metadata, employee_provision_request_id: provisioningRequestId, onboarding_required: true },
  });
  if (metadataUpdate.error) {
    const reservation = await admin.from('profiles').insert({ id: authUser.id, ...profileInsert });
    if (reservation.error) return { error: 'The authentication account was created, but its recovery reservation could not be completed. Contact a system administrator before retrying.', fields };
    return { error: 'The authentication account was created but account setup is incomplete. Retry this same form.', fields };
  }
  const { error: profileError } = await admin.from('profiles').insert({
    id: authUser.id, ...profileInsert,
  });
  if (profileError) {
    return { error: `${profileError.message} The authentication account is retained so retrying this same form can recover safely.`, fields };
  }
  revalidatePath('/admin/employees');
  return { success: `${fullName} was created with their login email confirmed. They must change the initial password before using the workspace.` };
}
