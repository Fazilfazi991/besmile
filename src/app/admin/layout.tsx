import { serverSupabase } from '@/lib/supabase-server';
import { filterNavigation, isManagementRole, isSecurityAdministratorRole, navigationForProfile, navigationPermissionCodes } from '@/lib/permission-access';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { redirect } from 'next/navigation';
import { PermissionSidebar } from '@/components/permission-sidebar';
import { MobileNavigationProvider, MobileNavigationTrigger } from '@/components/mobile-navigation';
import { ThemeModeSwitcher } from '@/components/theme-mode-switcher';
import { TopbarProfileLink } from '@/components/topbar-profile-link';
import { grantedPermissions } from '@/lib/granted-permissions';
import { PageBackButton } from '@/components/page-back-button';
import '../workspace-density.css';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile, error: profileError } = await db.from('profiles').select('full_name,email,role,designation,status').eq('id', user.id).maybeSingle();
  if (profileError) {
    console.warn('Admin layout profile lookup failed', { route: '/admin', userId: user.id, code: profileError.code });
    redirect('/unauthorized');
  }
  if (!profile) redirect('/unauthorized');
  if (profile.status === 'inactive' || profile.status === 'terminated') redirect('/sign-in?inactive=1');
  const allowed = await grantedPermissions(db, navigationPermissionCodes);
  if (profile.role !== 'super_admin' && !isManagementRole(profile.role) && !allowed.has('admin.shell')) redirect('/employee/dashboard');
  const isEmployeeShell = profile.role !== 'super_admin' && !isManagementRole(profile.role);
  const visibleGroups = filterNavigation(navigationForProfile(profile.role), allowed);
  const name = profile.full_name || profile.email || 'BSmile User';
  const profileHref = isEmployeeShell ? '/employee/profile' : isSecurityAdministratorRole(profile.role) ? '/admin/access' : '/admin/profile';
  const subtitle = profile.role === 'super_admin' ? 'Super Admin' : profile.designation || profile.role || 'Employee';
  const headerMode = isEmployeeShell ? 'employee' : 'admin';

  return <MobileNavigationProvider><div className="app-shell employee-shell">
    <PermissionSidebar groups={visibleGroups} name={name} subtitle={subtitle} profileHref={profileHref} />
    <main className="app-main">
      <header className="app-topbar"><div className="topbar-mode"><MobileNavigationTrigger /><ThemeModeSwitcher /></div><GlobalCommandCenter mode={headerMode} userId={user.id} canEmployees={allowed.has('employees.view')} canCrm={allowed.has('crm.manage_all') || allowed.has('crm.view_team') || allowed.has('leads.view')} canInvoices={allowed.has('invoices.view') || allowed.has('invoices.manage')} /><TopbarProfileLink href={profileHref} name={name} subtitle={subtitle} /></header>
      <div className="app-content"><PageBackButton />{children}</div>
    </main>
  </div></MobileNavigationProvider>;
}
