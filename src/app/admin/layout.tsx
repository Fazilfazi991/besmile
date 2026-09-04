import { serverSupabase } from '@/lib/supabase-server';
import { filterNavigation, isManagementRole, isSecurityAdministratorRole, navigationForProfile, navigationPermissionCodes } from '@/lib/permission-access';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { redirect } from 'next/navigation';
import { PermissionSidebar } from '@/components/permission-sidebar';
import { ThemeModeSwitcher } from '@/components/theme-mode-switcher';
import { grantedPermissions } from '@/lib/granted-permissions';
import Link from 'next/link';
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

  return <div className="app-shell employee-shell">
    <PermissionSidebar groups={visibleGroups} name={name} subtitle={subtitle} profileHref={profileHref} />
    <main className="app-main">
      <header className="app-topbar">{isEmployeeShell && <div><p className="eyebrow">BSMILE EMPLOYEE WORKSPACE</p><h1>My Workspace</h1></div>}<div className="topbar-actions"><ThemeModeSwitcher /><GlobalCommandCenter mode={headerMode} userId={user.id} canEmployees={allowed.has('employees.view')} canCrm={allowed.has('crm.manage_all') || allowed.has('crm.view_team') || allowed.has('leads.view')} canInvoices={allowed.has('invoices.view') || allowed.has('invoices.manage')} /><Link className="topbar-user" href={profileHref}><span>{name.slice(0, 1).toUpperCase()}</span><div><b>{name}</b><small>{subtitle}</small></div></Link></div></header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}
