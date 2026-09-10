import { serverSupabase } from '@/lib/supabase-server';
import { isSecurityAdministratorRole } from '@/lib/permission-access';
import { redirect } from 'next/navigation';
import { serverAuthorizationRead } from '@/lib/server-authorization-read';

export default async function AccessAdministrationLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await serverAuthorizationRead(() => db.auth.getUser(), 'access.session', true);
  if (!user) redirect('/sign-in');
  const { data: profile } = await serverAuthorizationRead(signal => db.from('profiles').select('role,status').eq('id', user.id).abortSignal(signal).maybeSingle(), 'access.profile');
  if (!profile) redirect('/unauthorized');
  if (profile.status === 'inactive' || profile.status === 'terminated') redirect('/sign-in?inactive=1');
  if (!isSecurityAdministratorRole(profile.role)) redirect('/unauthorized');
  return children;
}
