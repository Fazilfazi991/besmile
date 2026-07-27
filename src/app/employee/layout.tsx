import { serverSupabase } from '@/lib/supabase-server';
import { SignOutButton } from '@/components/sign-out-button';
import { GlobalCommandCenter } from '@/components/global-command-center';
import { redirect } from 'next/navigation';

const communicationLinks = [
  ['Announcements', '/employee/announcements'], ['Notifications', '/employee/notifications'], ['Chat', '/employee/chat'], ['Profile', '/employee/profile'],
];
const crmLinks = [['CRM Dashboard', '/employee/crm'], ['My Leads', '/employee/crm/leads'], ['My Follow-ups', '/employee/crm/follow-ups'], ['My Sales', '/employee/crm/sales']];

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await db.from('profiles').select('full_name, role, designation, status').eq('id', user.id).maybeSingle();
  if (!profile || profile.status !== 'active') redirect('/sign-in?inactive=1');
  if (profile.role === 'super_admin') redirect('/admin');
  const name = profile?.full_name || user.email?.split('@')[0] || 'BSmile User';
  const [assignPermission, accessPermission] = await Promise.all([
    db.rpc('has_permission', { permission_code: 'tasks.assign' }),
    db.rpc('has_permission', { permission_code: 'tasks.manage_access' }),
  ]);
  const workspaceLinks = [
    ['Dashboard', '/employee/dashboard'], ['Attendance', '/employee/attendance'], ['Leave', '/employee/leaves'],
    ['Tasks', '/employee/tasks'], ...(assignPermission.data ? [['Manage Tasks', '/employee/tasks/manage']] : []),
    ...(accessPermission.data ? [['Task Assignment Access', '/employee/tasks/access']] : []), ['Documents', '/employee/documents'],
  ];

  return <div className="app-shell employee-shell">
    <aside className="app-sidebar">
      <div className="brand"><img src="/images/bsmile-logo.png" alt="BSmile" /></div>
      <nav>
        <EmployeeNavGroup title="WORKSPACE" links={workspaceLinks} />
        <EmployeeNavGroup title="COMMUNICATION" links={communicationLinks} />
        <EmployeeNavGroup title="CRM" links={crmLinks} />
      </nav>
      <div className="sidebar-footer"><a className="sidebar-user" href="/employee/profile"><b>{name}</b><small>{profile?.designation || profile?.role || 'Employee'}</small></a><SignOutButton /></div>
    </aside>
    <main className="app-main">
      <header className="app-topbar"><div><p className="eyebrow">BSMILE EMPLOYEE WORKSPACE</p><h1>My Workspace</h1></div><div className="flex items-center gap-3"><GlobalCommandCenter mode="employee" userId={user.id} /><a className="topbar-user" href="/employee/profile"><span>{name.slice(0, 1).toUpperCase()}</span><div><b>{name}</b><small>{profile?.designation || 'Employee'}</small></div></a></div></header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}

function EmployeeNavGroup({ title, links }: { title: string; links: string[][] }) {
  return <div className="nav-group"><p>{title}</p>{links.map(([label, href]) => <a className="nav-link" href={href} key={href}>{label}</a>)}</div>;
}
