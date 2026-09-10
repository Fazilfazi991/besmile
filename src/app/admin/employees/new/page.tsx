import { serverSupabase } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { isSecurityAdministratorRole } from '@/lib/permission-access';
import { EmployeeCreateForm } from './form';
import { serverAuthorizationRead, serverPermissionRead } from '@/lib/server-authorization-read';

export default async function NewEmployeePage() {
  const db = await serverSupabase();
  const { data: { user } } = await serverAuthorizationRead(() => db.auth.getUser(), 'employee-create.session', true);
  if (!user) redirect('/sign-in');
  const [{ data: profile }, permission, departments, managers] = await Promise.all([
    serverAuthorizationRead(signal => db.from('profiles').select('role,status').eq('id', user.id).abortSignal(signal).maybeSingle(), 'employee-create.profile'), serverPermissionRead(signal => db.rpc('has_permission', { permission_code: 'employees.create' }).abortSignal(signal), 'employee-create.permission'),
    db.from('departments').select('id,name').order('name'), db.from('profiles').select('id,full_name,role').eq('workforce_visible', true).eq('status', 'active').in('role', ['super_admin', 'chairman', 'director', 'general_manager']).order('full_name'),
  ]);
  if (!profile || profile.status !== 'active' || !permission.data) redirect('/unauthorized');
  const referenceErrors = [
    departments.error && 'Departments could not be loaded.',
    managers.error && 'Reporting managers could not be loaded.',
  ].filter(Boolean);
  if (referenceErrors.length) console.warn('Add employee reference data failed', { route: '/admin/employees/new', userId: user.id, referenceErrors });
  return <EmployeeCreateForm departments={departments.data} managers={managers.data} referenceError={referenceErrors.join(' ')} canCreateProtectedRoles={isSecurityAdministratorRole(profile.role)} />;
}
