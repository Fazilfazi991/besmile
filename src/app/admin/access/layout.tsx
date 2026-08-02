import { serverSupabase } from '@/lib/supabase-server';
import { isSecurityAdministratorRole } from '@/lib/permission-access';
import { redirect } from 'next/navigation';

export default async function AccessAdministrationLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'active') redirect('/sign-in?inactive=1');
  if (!isSecurityAdministratorRole(profile.role)) redirect('/unauthorized');
  return children;
}
