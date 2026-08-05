import { serverSupabase } from '@/lib/supabase-server';
import { SignOutButton } from '@/components/sign-out-button';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { redirect } from 'next/navigation';
import { employeeNavigation, filterNavigation, isManagementRole, navigationPermissionCodes } from '@/lib/permission-access';

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile, error: profileError } = await db.from('profiles').select('full_name, role, designation, status').eq('id', user.id).maybeSingle();
  if (profileError) {
    console.warn('Employee layout profile lookup failed', { route: '/employee', userId: user.id, code: profileError.code });
    redirect('/unauthorized');
  }
  if (!profile) redirect('/unauthorized');
  if (profile.status === 'inactive' || profile.status === 'terminated') redirect('/sign-in?inactive=1');
  if (profile.role === 'super_admin' || isManagementRole(profile.role)) redirect('/admin');
  const name = profile?.full_name || user.email?.split('@')[0] || 'BSmile User';
  const permissionResults = await Promise.all(navigationPermissionCodes.map((permission) => db.rpc('has_permission', { permission_code: permission })));
  const allowed = new Set<string>(navigationPermissionCodes.filter((_, index) => permissionResults[index].data === true));
  const visibleGroups = filterNavigation(employeeNavigation, allowed);

  return <div className="app-shell employee-shell">
    <aside className="app-sidebar">
      <div className="brand"><img src="/images/bsmile-logo.png" alt="BSmile" /></div>
      <nav>{visibleGroups.map((group) => <EmployeeNavGroup title={group.title} links={group.links} key={group.title} />)}</nav>
      <div className="sidebar-footer"><a className="sidebar-user" href="/employee/profile"><b>{name}</b><small>{profile?.designation || profile?.role || 'Employee'}</small></a><SignOutButton /></div>
    </aside>
    <main className="app-main">
      <header className="app-topbar"><div><p className="eyebrow">BSMILE EMPLOYEE WORKSPACE</p><h1>My Workspace</h1></div><div className="flex items-center gap-3"><GlobalCommandCenter mode="employee" userId={user.id} /><a className="topbar-user" href="/employee/profile"><span>{name.slice(0, 1).toUpperCase()}</span><div><b>{name}</b><small>{profile?.designation || 'Employee'}</small></div></a></div></header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}

function EmployeeNavGroup({ title, links }: { title: string; links: readonly { label: string; href: string }[] }) {
  return <div className="nav-group"><p>{title}</p>{links.map((link) => <a className="nav-link" href={link.href} key={link.href}>{link.label}</a>)}</div>;
}
