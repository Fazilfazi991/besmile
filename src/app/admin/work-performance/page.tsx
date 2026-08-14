import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase-server';
import { attentionItems, type WorkloadRow } from '@/lib/work-performance-rules';

type Summary = {
  business_date: string;
  period_start: string;
  period_end: string;
  snapshot: { todo: number; in_progress: number; completed: number; open_tasks: number; due_today: number; overdue: number; completed_in_period: number };
  employees: (WorkloadRow & { employee_code?: string | null; designation?: string | null; department_name?: string | null; todo: number; in_progress: number; completed: number; completed_in_period: number; attendance_status?: string | null })[];
};

function reportingPeriod(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { month: value, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function currentKolkataMonth() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function recentMonths(currentMonth: string) {
  const [year, month] = currentMonth.split('-').map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return date.toISOString().slice(0, 7);
  });
}

function taskLink(employeeId?: string, status?: string) {
  const params = new URLSearchParams();
  if (employeeId) params.set('employee', employeeId);
  if (status) params.set('status', status);
  const query = params.toString();
  return `/admin/tasks${query ? `?${query}` : ''}`;
}

export default async function WorkPerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const requested = reportingPeriod((await searchParams).month);
  const defaultMonth = currentKolkataMonth();
  const period = requested || reportingPeriod(defaultMonth)!;
  const db = await serverSupabase();
  const { data: allowed } = await db.rpc('has_permission', { permission_code: 'work_performance.view' });
  if (!allowed) redirect('/unauthorized');
  const { data, error } = await db.rpc('work_performance_summary', { p_period_start: period.start, p_period_end: period.end });
  if (error || !data) return <section className="space-y-4"><div><h1 className="text-2xl font-bold">Work &amp; Performance</h1><p className="text-slate-600">Management visibility based on current task ownership.</p></div><div className="card p-5 text-rose-700">The work summary is temporarily unavailable. Please try again.</div></section>;
  const summary = data as Summary;
  const attention = attentionItems(summary.employees);
  const monthLabel = new Date(`${period.start}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  return <section className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">MANAGEMENT VISIBILITY</p><h1 className="text-2xl font-bold">Work &amp; Performance</h1><p className="text-slate-600">Current task ownership and business-date workload context. This view does not score, rank, or infer performance.</p></div><form><label className="text-sm font-medium">Completed period<select className="ml-2 rounded border p-2" name="month" defaultValue={period.month}>{recentMonths(defaultMonth).map((month) => <option key={month} value={month}>{new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}</option>)}</select></label><button className="ml-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">Apply</button></form></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Open tasks" value={summary.snapshot.open_tasks} href={taskLink(undefined, 'todo')} /><Metric label="In progress" value={summary.snapshot.in_progress} href={taskLink(undefined, 'in_progress')} /><Metric label="Due today" value={summary.snapshot.due_today} href={taskLink()} /><Metric label="Overdue" value={summary.snapshot.overdue} href={taskLink()} /></div>

    <div className="card p-4"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><h2 className="font-semibold">Work status</h2><p className="text-sm text-slate-600">Business date: {summary.business_date}. Due-date counts exclude completed and undated tasks.</p></div><p className="text-sm text-slate-600">Completed in {monthLabel}: <b>{summary.snapshot.completed_in_period}</b></p></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="To do" value={summary.snapshot.todo} href={taskLink(undefined, 'todo')} compact /><Metric label="In progress" value={summary.snapshot.in_progress} href={taskLink(undefined, 'in_progress')} compact /><Metric label="Completed" value={summary.snapshot.completed} href={taskLink(undefined, 'completed')} compact /></div></div>

    <div className="card overflow-x-auto"><div className="p-4"><h2 className="font-semibold">Employee workload</h2><p className="text-sm text-slate-600">Counts are based on current assignments only. Completion counts use <code>completed_at</code> but are not historical reassignment attribution.</p></div><table className="table min-w-[1050px]"><thead><tr><th>Employee</th><th>Current work</th><th>Due / overdue</th><th>Completed in period</th><th>Attendance / leave context</th><th /></tr></thead><tbody>{summary.employees.map((employee) => <tr key={employee.id}><td><b>{employee.full_name}</b><small className="block">{[employee.employee_code, employee.designation, employee.department_name].filter(Boolean).join(' · ') || '—'}</small></td><td>To do {employee.todo} · In progress {employee.in_progress}<br /><b>{employee.open_tasks} open</b></td><td>{employee.due_today_tasks} due today · {employee.overdue_tasks} overdue</td><td>{employee.completed_in_period}</td><td>{employee.on_leave ? 'Approved leave' : employee.attendance_recorded ? (employee.attendance_status || 'Attendance recorded') : 'Attendance not recorded'}</td><td><Link className="text-sm font-medium text-blue-700" href={taskLink(employee.id)}>View tasks</Link></td></tr>)}{!summary.employees.length && <tr><td className="p-5 text-slate-500" colSpan={6}>No active workforce-visible employees were found.</td></tr>}</tbody></table></div>

    <div className="card p-4"><h2 className="font-semibold">Attention required</h2><p className="mt-1 text-sm text-slate-600">Action prompts, not performance labels. Approved leave is context only; missing attendance is not treated as absence.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{attention.map((item, index) => <div className="rounded border p-3" key={`${item.employeeId}-${item.kind}-${index}`}><b>{item.employeeName}</b><p className="text-sm text-slate-600">{item.detail}</p><Link className="mt-2 inline-block text-sm font-medium text-blue-700" href={taskLink(item.employeeId)}>Open canonical tasks</Link></div>)}{!attention.length && <p className="text-sm text-slate-500">No current workload attention items.</p>}</div></div>

    <p className="text-xs text-slate-500">Due dates are business dates in Asia/Kolkata, not timestamps. The system intentionally does not calculate on-time completion rates, lateness, scores, rankings, or historical reassignment attribution.</p>
  </section>;
}

function Metric({ label, value, href, compact = false }: { label: string; value: number; href: string; compact?: boolean }) {
  return <Link className={`card block p-4 transition hover:border-slate-400 ${compact ? '' : 'min-h-24'}`} href={href}><p className="text-sm text-slate-600">{label}</p><b className="text-2xl">{value}</b></Link>;
}
