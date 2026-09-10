import { serverSupabase } from '@/lib/supabase-server';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { redirect } from 'next/navigation';
import { filterNavigation, isManagementRole, navigationForProfile, navigationPermissionCodes } from '@/lib/permission-access';
import { PermissionSidebar } from '@/components/permission-sidebar';
import { MobileNavigationProvider, MobileNavigationTrigger } from '@/components/mobile-navigation';
import { ThemeModeSwitcher } from '@/components/theme-mode-switcher';
import { TopbarProfileLink } from '@/components/topbar-profile-link';
import { grantedPermissions } from '@/lib/granted-permissions';
import { PageBackButton } from '@/components/page-back-button';
import { serverAuthorizationRead, serverAuthorizationBoundary } from '@/lib/server-authorization-read';
import '../workspace-density.css';

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await serverAuthorizationRead(() => db.auth.getUser(), 'employee.session', true);
  if (!user) redirect('/sign-in');
  const { data: profile } = await serverAuthorizationRead(signal => db.from('profiles').select('full_name, role, designation, status').eq('id', user.id).abortSignal(signal).maybeSingle(), 'employee.profile');
  if (!profile) redirect('/unauthorized');
  if (profile.status === 'inactive' || profile.status === 'terminated') redirect('/sign-in?inactive=1');
  if (profile.role === 'super_admin' || isManagementRole(profile.role)) redirect('/admin');
  const name = profile?.full_name || user.email?.split('@')[0] || 'BSmile User';
  const allowed = await serverAuthorizationBoundary(() => grantedPermissions(db, navigationPermissionCodes));
  const visibleGroups = filterNavigation(navigationForProfile(profile.role), allowed);

  return <MobileNavigationProvider><div className="app-shell employee-shell">
    <PermissionSidebar groups={visibleGroups} name={name} subtitle={profile?.designation || profile?.role || 'Employee'} profileHref="/employee/profile" />
    <main className="app-main">
      <header className="app-topbar"><div className="topbar-mode"><MobileNavigationTrigger /><ThemeModeSwitcher /></div><GlobalCommandCenter mode="employee" userId={user.id} /><TopbarProfileLink href="/employee/profile" name={name} subtitle={profile?.designation || 'Employee'} /></header>
      <div className="app-content"><PageBackButton />{children}</div>
    </main>
  </div></MobileNavigationProvider>;
}
