import { serverSupabase } from '@/lib/supabase-server';
import { adminNavigation, filterNavigation, isManagementRole, isSecurityAdministratorRole, navigationPermissionCodes, workspaceTitle } from '@/lib/permission-access';
import { SignOutButton } from '@/components/sign-out-button';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { redirect } from 'next/navigation';

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
  const permissionResults = await Promise.all(navigationPermissionCodes.map(permission => db.rpc('has_permission', { permission_code: permission })));
  const allowed = new Set<string>(navigationPermissionCodes.filter((_, index) => permissionResults[index].data === true));
  if (profile.role !== 'super_admin' && !isManagementRole(profile.role) && !allowed.has('admin.shell')) redirect('/employee/dashboard');
  const visibleGroups = filterNavigation(adminNavigation, allowed);
  const name = profile.full_name || profile.email || 'BSmile User';
  const profileHref = isSecurityAdministratorRole(profile.role) ? '/admin/access' : '/admin/profile';

  return <div className="app-shell employee-shell">
    <aside className="app-sidebar">
      <div className="brand"><img src="/images/bsmile-logo.png" alt="BSmile" /></div>
      <nav>{visibleGroups.map(group => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.links.map(link => <a className="nav-link" href={link.href} key={link.href}>{link.label}</a>)}</div>)}</nav>
      <div className="sidebar-footer"><a className="sidebar-user" href={profileHref}><b>{name}</b><small>{profile.role === 'super_admin' ? 'Super Admin' : profile.designation || profile.role}</small></a><SignOutButton /></div>
    </aside>
    <main className="app-main">
      <header className="app-topbar"><div><p className="eyebrow">BSMILE CONTROL CENTER</p><h1>{workspaceTitle(profile.role)}</h1></div><div className="flex items-center gap-3"><GlobalCommandCenter mode="admin" userId={user.id} canEmployees={allowed.has('employees.view')} canCrm={allowed.has('crm.manage_all') || allowed.has('crm.view_team') || allowed.has('leads.view')} canInvoices={allowed.has('invoices.view') || allowed.has('invoices.manage')} /><a className="topbar-user" href={profileHref}><span>{name.slice(0, 1).toUpperCase()}</span><div><b>{name}</b><small>{profile.role === 'super_admin' ? 'Super Admin' : profile.designation || 'Management'}</small></div></a></div></header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}
