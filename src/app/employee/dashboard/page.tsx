'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { freshLocation } from '@/lib/attendance-geofence';
import { permissionAllows, type PermissionRequirement } from '@/lib/permission-access';

type DashboardData = Record<string, any>;

const dashboardPermissionCodes = ['attendance.self', 'attendance.view_self', 'attendance.view', 'attendance.manage', 'tasks.view_self', 'tasks.assign', 'leave.self', 'leave.request', 'leave.view', 'leave.manage', 'leave.approve', 'documents.view', 'documents.employee.view', 'patient_documents.view', 'announcements.view', 'announcements.manage', 'notifications.view', 'chat.use', 'crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view', 'sales.view'] as const;
const todayKey = () => new Date().toISOString().slice(0, 10);
const fmtDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not set';
const fmtTime = (value?: string | null) => value ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '--';
const employeeNotificationLink = (link?: string | null) => link?.startsWith('/employee/') ? link : '/employee/notifications';
const has = (permissions: ReadonlySet<string>, requirement: PermissionRequirement) => permissionAllows(permissions, requirement);

export default function EmployeeDashboard() {
  const [profile, setProfile] = useState<any>();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const signedInProfile = await currentProfile() as any;
      if (!signedInProfile) throw new Error('Your session has expired. Please sign in again.');
      setProfile(signedInProfile);

      const permissionChecks = await Promise.all(dashboardPermissionCodes.map(permission => employeeRepository.hasPermission(permission)));
      const permissions = new Set<string>(dashboardPermissionCodes.filter((_, index) => permissionChecks[index]));
      const can = (requirement: PermissionRequirement) => has(permissions, requirement);
      const canCrm = can({ anyOf: ['crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view', 'sales.view'] });

      const results = await Promise.allSettled([
        can({ anyOf: ['attendance.self', 'attendance.view_self', 'attendance.view', 'attendance.manage'] }) ? employeeRepository.attendanceHistory(signedInProfile.id) : Promise.resolve([]),
        can({ anyOf: ['tasks.view_self', 'tasks.assign'] }) ? employeeRepository.myTasks(signedInProfile.id) : Promise.resolve([]),
        can({ anyOf: ['leave.self', 'leave.request', 'leave.view', 'leave.manage', 'leave.approve'] }) ? employeeRepository.leaveHistory(signedInProfile.id) : Promise.resolve([]),
        can({ anyOf: ['documents.view', 'documents.employee.view', 'patient_documents.view'] }) ? employeeRepository.documentRequests(signedInProfile.id) : Promise.resolve([]),
        can({ anyOf: ['announcements.view', 'announcements.manage'] }) ? employeeRepository.announcements(signedInProfile.id) : Promise.resolve([]),
        employeeRepository.notifications(signedInProfile.id, 0, 20),
        employeeRepository.profile(signedInProfile.id),
        canCrm ? employeeRepository.myCrmLeads(signedInProfile.id) : Promise.resolve([]),
        canCrm ? employeeRepository.myCrmFollowups(signedInProfile.id) : Promise.resolve([]),
        canCrm ? employeeRepository.myCrmSales(signedInProfile.id) : Promise.resolve([]),
      ]);
      const [attendance, tasks, leaves, documents, announcements, notifications, richProfile, crmLeads, crmFollowups, crmSales] = results;
      setData({
        permissions,
        attendance: attendance.status === 'fulfilled' ? attendance.value : [],
        tasks: tasks.status === 'fulfilled' ? tasks.value : [],
        leaves: leaves.status === 'fulfilled' ? leaves.value : [],
        documents: documents.status === 'fulfilled' ? documents.value : [],
        announcements: announcements.status === 'fulfilled' ? announcements.value : [],
        notifications: notifications.status === 'fulfilled' ? notifications.value : [],
        richProfile: richProfile.status === 'fulfilled' ? richProfile.value : signedInProfile,
        crmLeads: crmLeads.status === 'fulfilled' ? crmLeads.value : [],
        crmFollowups: crmFollowups.status === 'fulfilled' ? crmFollowups.value : [],
        crmSales: crmSales.status === 'fulfilled' ? crmSales.value : [],
      });
      const failed = results.filter(result => result.status === 'rejected').length;
      setError(failed ? `${failed} dashboard section${failed === 1 ? '' : 's'} could not be refreshed.` : '');
    } catch (caughtError: any) {
      setError(caughtError.message || 'Unable to load your workspace.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const todayAttendance = useMemo(() => (data.attendance || []).find((item: any) => item.work_date === todayKey()), [data.attendance]);
  const activeBreak = todayAttendance?.attendance_breaks?.find((item: any) => !item.ended_at);
  const tasks = data.tasks || [];
  const activeTasks = tasks.filter((item: any) => item.status !== 'completed');
  const announcements = data.announcements || [];
  const notifications = data.notifications || [];
  const pendingLeaves = (data.leaves || []).filter((item: any) => item.status === 'pending');
  const pendingDocuments = (data.documents || []).filter((item: any) => ['requested', 'rejected'].includes(item.status));
  const unreadNotifications = notifications.filter((item: any) => !item.read_at).length;
  const unreadAnnouncements = announcements.filter((item: any) => !item.is_read).length;
  const today = todayKey();
  const crmLeads = data.crmLeads || [];
  const crmFollowups = data.crmFollowups || [];
  const crmSales = data.crmSales || [];
  const permissions = data.permissions || new Set<string>();
  const canAttendance = has(permissions, { anyOf: ['attendance.self', 'attendance.view_self', 'attendance.view', 'attendance.manage'] });
  const canTasks = has(permissions, { anyOf: ['tasks.view_self', 'tasks.assign'] });
  const canLeave = has(permissions, { anyOf: ['leave.self', 'leave.request', 'leave.view', 'leave.manage', 'leave.approve'] });
  const canDocuments = has(permissions, { anyOf: ['documents.view', 'documents.employee.view', 'patient_documents.view'] });
  const canAnnouncements = has(permissions, { anyOf: ['announcements.view', 'announcements.manage'] });
  const canChat = has(permissions, { anyOf: ['chat.use'] });
  const canCrm = has(permissions, { anyOf: ['crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view', 'sales.view'] });

  const attendanceAction = async (action: 'clockIn' | 'clockOut' | 'startBreak' | 'endBreak') => {
    if (!profile) return;
    setNotice(''); setError(''); setRefreshing(true);
    try {
      if (action === 'clockIn') await employeeRepository.clockIn(profile.id, await freshLocation());
      if (action === 'clockOut' && todayAttendance) await employeeRepository.clockOut(todayAttendance.id, await freshLocation());
      if (action === 'startBreak' && todayAttendance) await employeeRepository.startBreak(todayAttendance.id);
      if (action === 'endBreak' && activeBreak) await employeeRepository.endBreak(activeBreak.id);
      setNotice('Attendance updated.'); await load(true);
    } catch (caughtError: any) { setError(caughtError.message || 'Attendance could not be updated.'); setRefreshing(false); }
  };

  const markAllRead = async () => {
    if (!profile) return;
    try { await employeeRepository.markAllNotificationsRead(profile.id); setNotice('All notifications marked as read.'); await load(true); }
    catch (caughtError: any) { setError(caughtError.message || 'Unable to update notifications.'); }
  };

  if (loading) return <DashboardState title="Preparing your workspace" detail="Loading today's attendance, tasks, updates, and requests..." />;
  if (!profile) return <DashboardState title="Unable to load dashboard" detail={error || 'Please sign in again.'} />;

  const richProfile = data.richProfile || profile;
  const displayTasks = [...activeTasks].sort((a: any, b: any) => String(a.tasks?.due_date || '9999').localeCompare(String(b.tasks?.due_date || '9999'))).slice(0, 5);
  const displayAnnouncements = announcements.slice(0, 3);
  const displayNotifications = notifications.slice(0, 5);
  const upcoming = [
    ...activeTasks.filter((item: any) => item.tasks?.due_date).map((item: any) => ({ date: item.tasks.due_date, label: item.tasks.title, kind: 'Task' })),
    ...(data.leaves || []).filter((item: any) => item.status === 'approved' && item.starts_on >= today).map((item: any) => ({ date: item.starts_on, label: `${item.leave_type || 'Leave'} leave`, kind: 'Leave' })),
    ...pendingDocuments.filter((item: any) => item.due_date).map((item: any) => ({ date: item.due_date, label: item.title || item.request_title || 'Document request', kind: 'Document' })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 5);

  return <div className="employee-dashboard">
    <div className="dashboard-welcome">
      <div><p className="eyebrow">{new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p><h2>Good morning, {profile.full_name}.</h2><p>{richProfile.department?.name || 'BSmile'} {richProfile.designation ? `- ${richProfile.designation}` : ''} - here is your day at a glance.</p></div>
      <a href="/employee/profile" className="profile-chip"><span>{profile.full_name?.slice(0, 1)?.toUpperCase() || 'B'}</span><div><b>My profile</b><small>View details</small></div></a>
    </div>
    {error && <p className="dashboard-message dashboard-error">{error}</p>}{notice && <p className="dashboard-message dashboard-success">{notice}</p>}

    {canAttendance && <section className="attendance-card">
      <div><p className="eyebrow">TODAY&apos;S ATTENDANCE</p><h3>{!todayAttendance ? 'Not clocked in' : todayAttendance.clock_out ? 'Day completed' : activeBreak ? 'On a break' : 'Working today'}</h3><p>Clock in: <b>{fmtTime(todayAttendance?.clock_in)}</b> &nbsp; Clock out: <b>{fmtTime(todayAttendance?.clock_out)}</b></p><p className="attendance-duration">{workingDuration(todayAttendance, activeBreak)}</p></div>
      <div className="attendance-actions">
        {!todayAttendance && <button className="button button-primary" disabled={refreshing} onClick={() => void attendanceAction('clockIn')}>Clock in</button>}
        {todayAttendance && !todayAttendance.clock_out && !activeBreak && <><button className="button button-secondary" disabled={refreshing} onClick={() => void attendanceAction('startBreak')}>Start break</button><button className="button button-primary" disabled={refreshing} onClick={() => void attendanceAction('clockOut')}>Clock out</button></>}
        {activeBreak && <button className="button button-primary" disabled={refreshing} onClick={() => void attendanceAction('endBreak')}>End break</button>}
        <a className="button button-quiet" href="/employee/attendance">Attendance history</a>
      </div>
    </section>}

    <section className="dashboard-metrics">
      {canTasks && <Metric label="Pending tasks" value={activeTasks.length} href="/employee/tasks" />}
      {canTasks && <Metric label="Due today" value={activeTasks.filter((item: any) => item.tasks?.due_date === today).length} href="/employee/tasks" />}
      {canLeave && <Metric label="Pending leave" value={pendingLeaves.length} href="/employee/leaves" />}
      <Metric label="Unread updates" value={unreadNotifications} href="/employee/notifications" />
      {canAnnouncements && <Metric label="Unread announcements" value={unreadAnnouncements} href="/employee/announcements" />}
      {canDocuments && <Metric label="Document requests" value={pendingDocuments.length} href="/employee/documents" />}
      {canCrm && <Metric label="My leads" value={crmLeads.length} href="/employee/crm/leads" />}
      {canCrm && <Metric label="CRM follow-ups today" value={crmFollowups.filter((item: any) => String(item.next_follow_up_at || '').slice(0, 10) === today).length} href="/employee/crm/follow-ups" />}
      {canCrm && <Metric label="Hot leads" value={crmLeads.filter((item: any) => item.temperature === 'hot').length} href="/employee/crm/leads" />}
      {canCrm && <Metric label="My sales" value={crmSales.length} href="/employee/crm/sales" />}
    </section>

    <section className="quick-actions">{canLeave && <Link href="/employee/leaves">Apply for leave</Link>}{canTasks && <Link href="/employee/tasks">View tasks</Link>}{canDocuments && <Link href="/employee/documents">Upload document</Link>}{canChat && <Link href="/employee/chat">Open chat</Link>}<Link href="/employee/profile">View profile</Link>{canCrm && <Link href="/employee/crm/leads">Add lead</Link>}{canCrm && <Link href="/employee/crm">Open CRM</Link>}{canCrm && <Link href="/employee/crm/follow-ups">CRM follow-ups</Link>}</section>

    <div className="dashboard-columns">
      {canTasks && <Section title="My tasks" link="/employee/tasks" linkLabel="View all tasks"><div className="dashboard-list">{displayTasks.length ? displayTasks.map((item: any) => <TaskRow key={item.id} item={item} today={today} />) : <Empty text="You have no active tasks." />}</div></Section>}
      {canAnnouncements && <Section title="Announcements" link="/employee/announcements" linkLabel="View all announcements"><div className="dashboard-list">{displayAnnouncements.length ? displayAnnouncements.map((item: any) => <a className="list-item" href={`/employee/announcements/${item.id}`} key={item.id}><div><b>{item.title}</b><small>{item.category} - {fmtDate(item.published_at)}</small></div><StatusBadge value={item.is_read ? 'Read' : 'New'} /></a>) : <Empty text="No announcements right now." />}</div></Section>}
      <Section title="Notifications" link="/employee/notifications" linkLabel="View all notifications" action={unreadNotifications ? <button className="text-button" onClick={() => void markAllRead()}>Mark all read</button> : undefined}><div className="dashboard-list">{displayNotifications.length ? displayNotifications.map((item: any) => <a className="list-item" href={employeeNotificationLink(item.deep_link)} key={item.id}><div><b>{item.title}</b><small>{item.message || item.body || 'Open to view details'} - {relativeTime(item.created_at)}</small></div><StatusBadge value={item.read_at ? 'Read' : 'New'} /></a>) : <Empty text="You are all caught up." />}</div></Section>
      {canLeave && <Section title="Leave requests" link="/employee/leaves" linkLabel="Manage leave"><div className="dashboard-list">{(data.leaves || []).slice(0, 3).map((item: any) => <a className="list-item" href="/employee/leaves" key={item.id}><div><b>{item.leave_types?.name || item.leave_type || 'Leave request'}</b><small>{fmtDate(item.starts_on)} - {fmtDate(item.ends_on)}</small></div><StatusBadge value={item.status} /></a>)}{!(data.leaves || []).length && <Empty text="No leave requests yet." />}</div></Section>}
      {canDocuments && <Section title="Document requests" link="/employee/documents" linkLabel="View documents"><div className="dashboard-list">{pendingDocuments.slice(0, 3).map((item: any) => <a className="list-item" href="/employee/documents" key={item.id}><div><b>{item.title || item.request_title || 'Requested document'}</b><small>Due {fmtDate(item.due_date)}</small></div><StatusBadge value={item.status} /></a>)}{!pendingDocuments.length && <Empty text="No documents are waiting for you." />}</div></Section>}
      {canTasks && <Section title="Upcoming" link="/employee/tasks" linkLabel="View tasks"><div className="dashboard-list">{upcoming.length ? upcoming.map((item, index) => <div className="list-item" key={`${item.kind}-${index}`}><div><b>{item.label}</b><small>{item.kind} - {fmtDate(item.date)}</small></div><StatusBadge value={item.kind} /></div>) : <Empty text="Nothing upcoming at the moment." />}</div></Section>}
    </div>
  </div>;
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) { return <a className="metric-card metric-link" href={href}><p>{label}</p><b>{value}</b><small>View details</small></a>; }
function Section({ title, link, linkLabel, action, children }: any) { return <section className="dashboard-section"><div className="section-heading"><h3>{title}</h3><div>{action}<a href={link}>{linkLabel}</a></div></div>{children}</section>; }
function StatusBadge({ value }: { value: string }) { return <span className={`status-badge status-${String(value).toLowerCase().replace(/\s+/g, '-')}`}>{String(value).replace('_', ' ')}</span>; }
function Empty({ text }: { text: string }) { return <p className="dashboard-empty">{text}</p>; }
function DashboardState({ title, detail }: { title: string; detail: string }) { return <section className="dashboard-state"><h2>{title}</h2><p>{detail}</p><a className="button button-primary" href="/sign-in">Sign in</a></section>; }
function TaskRow({ item, today }: { item: any; today: string }) { const task = item.tasks || {}; const overdue = item.status !== 'completed' && task.due_date && task.due_date < today; return <a className="list-item" href="/employee/tasks"><div><b>{task.title || 'Untitled task'}</b><small>{task.priority || 'medium'} priority - Due {fmtDate(task.due_date)}</small></div><div className="badge-stack">{overdue && <StatusBadge value="Overdue" />}<StatusBadge value={item.status || 'todo'} /></div></a>; }
function relativeTime(value?: string) { if (!value) return 'Recently'; const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 60 ? `${minutes || 1}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; }
function workingDuration(attendance: any, activeBreak: any) { if (!attendance?.clock_in) return 'Clock in to start your workday.'; const end = attendance.clock_out ? new Date(attendance.clock_out).getTime() : Date.now(); const openBreak = activeBreak ? Math.max(0, Math.round((Date.now() - new Date(activeBreak.started_at).getTime()) / 60000)) : 0; const totalMinutes = Math.max(0, Math.round((end - new Date(attendance.clock_in).getTime()) / 60000) - (attendance.break_minutes || 0) - openBreak); return `Working duration: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`; }
