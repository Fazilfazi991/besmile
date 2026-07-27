import { serverSupabase } from '@/lib/supabase-server';
import { superAdminNavigation } from '@/lib/permission-catalogue';
import { SignOutButton } from '@/components/sign-out-button';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await db.from('profiles').select('full_name,email,role,designation,status').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'active') redirect('/sign-in?inactive=1');
  if (profile.role === 'chairman') redirect('/employee/dashboard');
  const permissionCodes = [...new Set(superAdminNavigation.flatMap(group => group.links.map(link => link.permission)))];
  const permissionResults = await Promise.all(permissionCodes.map(permission => db.rpc('has_permission', { permission_code: permission })));
  const allowed = new Set<string>(permissionCodes.filter((_, index) => !!permissionResults[index].data));
  const visibleGroups = superAdminNavigation.map(group => ({ ...group, links: group.links.filter(link => allowed.has(link.permission)) })).filter(group => group.links.length);
  const name = profile.full_name || profile.email || 'BSmile User';

  return <div className="app-shell employee-shell">
    <aside className="app-sidebar">
      <div className="brand"><img src="/images/bsmile-logo.png" alt="BSmile" /></div>
      <nav>{visibleGroups.map(group => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.links.map(link => <a className="nav-link" href={link.href} key={link.href}>{link.label}</a>)}</div>)}</nav>
      <div className="sidebar-footer"><a className="sidebar-user" href="/admin/access"><b>{name}</b><small>{profile.role === 'super_admin' ? 'Super Admin' : profile.designation || profile.role}</small></a><SignOutButton /></div>
    </aside>
    <main className="app-main">
      <header className="app-topbar"><div><p className="eyebrow">BSMILE CONTROL CENTER</p><h1>Super Admin Workspace</h1></div><div className="flex items-center gap-3"><GlobalCommandCenter mode="admin" userId={user.id} canEmployees={allowed.has('employees.view')} canCrm={allowed.has('crm.manage_all') || allowed.has('crm.view_team')} canInvoices={allowed.has('invoices.view')} /><a className="topbar-user" href="/admin/access"><span>{name.slice(0, 1).toUpperCase()}</span><div><b>{name}</b><small>{profile.role === 'super_admin' ? 'Super Admin' : profile.designation || 'Management'}</small></div></a></div></header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}
