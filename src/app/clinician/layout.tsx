import { redirect } from 'next/navigation';
import '../workspace-density.css';
import { serverSupabase } from '@/lib/supabase-server';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { PermissionSidebar } from '@/components/permission-sidebar';
import { MobileNavigationProvider, MobileNavigationTrigger } from '@/components/mobile-navigation';
import { ThemeModeSwitcher } from '@/components/theme-mode-switcher';
import { TopbarProfileLink } from '@/components/topbar-profile-link';
import { PageBackButton } from '@/components/page-back-button';
import { serverAuthorizationRead } from '@/lib/server-authorization-read';

const groups = [
  { title: 'CLINICIAN WORKSPACE', links: [{ label: 'My Schedule', href: '/clinician/schedule' }, { label: 'My Clients', href: '/clinician/clients' }, { label: 'Chat', href: '/clinician/chat' }, { label: 'Notifications', href: '/clinician/notifications' }, { label: 'Profile', href: '/clinician/profile' }] },
];

export default async function ClinicianLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await serverAuthorizationRead(() => db.auth.getUser(), 'clinician.session', true);
  if (!user) redirect('/sign-in');
  const [{ data: profile }, { data: clinicianId }] = await Promise.all([
    serverAuthorizationRead(signal => db.from('profiles').select('full_name,designation,status,is_employee,onboarding_required').eq('id', user.id).abortSignal(signal).maybeSingle(), 'clinician.profile'),
    serverAuthorizationRead(signal => db.rpc('current_clinician_id').abortSignal(signal), 'clinician.identity'),
  ]);
  if (!profile || profile.status === 'inactive' || profile.status === 'terminated') redirect('/sign-in?inactive=1');
  if (profile.onboarding_required) redirect('/onboarding/password');
  if (!user.email_confirmed_at) redirect('/onboarding/password');
  if (profile.is_employee !== false || !clinicianId) redirect('/unauthorized');
  const name = profile.full_name || user.email?.split('@')[0] || 'Clinician';

  return <MobileNavigationProvider><div className="app-shell employee-shell">
    <PermissionSidebar groups={groups} name={name} subtitle={profile.designation || 'Outsourced psychologist'} profileHref="/clinician/profile" />
    <main className="app-main">
      <header className="app-topbar"><div className="topbar-mode"><MobileNavigationTrigger /><ThemeModeSwitcher /></div><GlobalCommandCenter mode="employee" userId={user.id} canEmployees={false} canCrm={false} canInvoices={false} /><TopbarProfileLink href="/clinician/profile" name={name} subtitle={profile.designation || 'Clinician'} /></header>
      <div className="app-content"><PageBackButton />{children}</div>
    </main>
  </div></MobileNavigationProvider>;
}
