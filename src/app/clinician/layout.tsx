import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase-server';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { PermissionSidebar } from '@/components/permission-sidebar';

const groups = [
  { title: 'CLINICIAN WORKSPACE', links: [{ label: 'My Schedule', href: '/clinician/schedule' }, { label: 'Notifications', href: '/clinician/notifications' }, { label: 'Profile', href: '/clinician/profile' }] },
];

export default async function ClinicianLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const [{ data: profile }, { data: clinicianId }] = await Promise.all([
    db.from('profiles').select('full_name,designation,status,is_employee').eq('id', user.id).maybeSingle(),
    db.rpc('current_clinician_id'),
  ]);
  if (!profile || profile.status === 'inactive' || profile.status === 'terminated') redirect('/sign-in?inactive=1');
  if (profile.is_employee !== false || !clinicianId) redirect('/unauthorized');
  const name = profile.full_name || user.email?.split('@')[0] || 'Clinician';

  return <div className="app-shell employee-shell">
    <PermissionSidebar groups={groups} name={name} subtitle={profile.designation || 'Outsourced psychologist'} profileHref="/clinician/profile" />
    <main className="app-main">
      <header className="app-topbar"><div><p className="eyebrow">BSMILE CLINICIAN WORKSPACE</p><h1>My Clinical Schedule</h1></div><div className="flex items-center gap-3"><GlobalCommandCenter mode="employee" userId={user.id} /><a className="topbar-user" href="/clinician/profile"><span>{name.slice(0, 1).toUpperCase()}</span><div><b>{name}</b><small>{profile.designation || 'Clinician'}</small></div></a></div></header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}
