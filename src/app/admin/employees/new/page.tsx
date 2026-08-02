import { serverSupabase } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { EmployeeCreateForm } from './form';

export default async function NewEmployeePage() {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const [{ data: profile }, permission, departments, managers] = await Promise.all([
    db.from('profiles').select('status').eq('id', user.id).maybeSingle(), db.rpc('has_permission', { permission_code: 'employees.create' }),
    db.from('departments').select('id,name').order('name'), db.from('profiles').select('id,full_name,role').eq('status', 'active').in('role', ['super_admin', 'chairman', 'director', 'general_manager']).order('full_name'),
  ]);
  if (!profile || profile.status !== 'active' || !permission.data) redirect('/unauthorized');
  return <EmployeeCreateForm departments={departments.data || []} managers={managers.data || []} />;
}
