import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase-server';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { PermissionSidebar } from '@/components/permission-sidebar';
import { MobileNavigationProvider, MobileNavigationTrigger } from '@/components/mobile-navigation';
import { ThemeModeSwitcher } from '@/components/theme-mode-switcher';
import { TopbarProfileLink } from '@/components/topbar-profile-link';

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

  return <MobileNavigationProvider><div className="app-shell employee-shell">
    <PermissionSidebar groups={groups} name={name} subtitle={profile.designation || 'Outsourced psychologist'} profileHref="/clinician/profile" />
    <main className="app-main">
      <header className="app-topbar"><div className="topbar-mode"><MobileNavigationTrigger /><ThemeModeSwitcher /></div><GlobalCommandCenter mode="employee" userId={user.id} /><TopbarProfileLink href="/clinician/profile" name={name} subtitle={profile.designation || 'Clinician'} /></header>
      <div className="app-content">{children}</div>
    </main>
  </div></MobileNavigationProvider>;
}
