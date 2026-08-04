import { serverSupabase } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { EmployeeCreateForm } from './form';

export default async function NewEmployeePage() {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const [{ data: profile, error: profileError }, permission, departments, managers] = await Promise.all([
    db.from('profiles').select('status').eq('id', user.id).maybeSingle(), db.rpc('has_permission', { permission_code: 'employees.create' }),
    db.from('departments').select('id,name').order('name'), db.from('profiles').select('id,full_name,role').eq('status', 'active').in('role', ['super_admin', 'chairman', 'director', 'general_manager']).order('full_name'),
  ]);
  if (profileError) {
    console.warn('Add employee profile lookup failed', { route: '/admin/employees/new', userId: user.id, code: profileError.code });
    redirect('/unauthorized');
  }
  if (!profile || profile.status !== 'active' || !permission.data) redirect('/unauthorized');
  const referenceErrors = [
    departments.error && 'Departments could not be loaded.',
    managers.error && 'Reporting managers could not be loaded.',
  ].filter(Boolean);
  if (referenceErrors.length) console.warn('Add employee reference data failed', { route: '/admin/employees/new', userId: user.id, referenceErrors });
  return <EmployeeCreateForm departments={departments.data} managers={managers.data} referenceError={referenceErrors.join(' ')} />;
}
