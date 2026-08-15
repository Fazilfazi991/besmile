'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminRepository } from '@/lib/admin-repository';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { isOverdue, taskHealth } from '@/lib/task-rules';

const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', completed: 'Completed' };
const emptyTask = { title: '', description: '', priority: 'medium', due_date: '', start_date: '', sla_duration: '', sla_unit: 'working_days', assigneeIds: [] as string[] };
const taskFormPayload = (form: HTMLFormElement) => {
  const data = Object.fromEntries(new FormData(form));
  const duration = String(data.sla_duration || '').trim();
  return { title: String(data.title || '').trim(), description: String(data.description || ''), priority: String(data.priority || 'medium'), due_date: String(data.due_date || ''), start_date: String(data.start_date || ''), sla_duration: duration ? Number(duration) : null, sla_unit: duration ? String(data.sla_unit || 'working_days') : null };
};
const dateLabel = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No due date';
const initials = (name?: string) => (name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();

export default function AdminTasksPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>();
  const [staff, setStaff] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState({ employee: '', status: '', priority: '', dueDate: '', query: '' });
  const [form, setForm] = useState(emptyTask);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [editing, setEditing] = useState<any>();
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [assigneeError, setAssigneeError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const hasBootstrapped = useRef(false);

  const loadTasks = async () => {
    try { setTasks(await adminRepository.tasks(filter)); setError(''); }
    catch (cause: any) { setError(cause?.message || 'Task list could not be loaded. Please try again.'); }
  };
  const load = async () => {
    setLoading(true);
    try {
      const [p, canManage] = await Promise.all([currentProfile() as Promise<any>, Promise.all(['tasks.manage', 'tasks.assign'].map(permission => employeeRepository.hasPermission(permission)))]);
      if (!p || !canManage.some(Boolean)) throw Error('You do not have permission to manage tasks.');
      setProfile(p);
      const [employees, allTasks] = await Promise.allSettled([adminRepository.employees('', 0, 100), adminRepository.tasks(filter)]);
      if (employees.status === 'fulfilled') { setStaff(employees.value.data); setAssigneeError(''); }
      else setAssigneeError('Assignee list could not be loaded. Existing tasks are still available.');
      if (allTasks.status === 'fulfilled') { setTasks(allTasks.value); setError(''); }
      else setError(allTasks.reason?.message || 'Task list could not be loaded. Please try again.');
    } catch (cause: any) { setError(cause?.message || 'Tasks could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!hasBootstrapped.current) { hasBootstrapped.current = true; return; } const timer = window.setTimeout(() => void loadTasks(), 180); return () => window.clearTimeout(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.employee, filter.status, filter.priority, filter.dueDate]);
  useEffect(() => { const refreshOnFocus = () => void loadTasks(); window.addEventListener('focus', refreshOnFocus); return () => window.removeEventListener('focus', refreshOnFocus); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.employee, filter.status, filter.priority, filter.dueDate]);

  const available = useMemo(() => staff.filter(person => !form.assigneeIds.includes(person.id) && `${person.full_name} ${person.email}`.toLowerCase().includes(assigneeQuery.toLowerCase())), [staff, form.assigneeIds, assigneeQuery]);
  const toggle = (id: string) => setForm(current => ({ ...current, assigneeIds: current.assigneeIds.includes(id) ? current.assigneeIds.filter(value => value !== id) : [...current.assigneeIds, id] }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    const payload = taskFormPayload(event.currentTarget);
    if (!payload.title) return setError('Task title is required.');
    if (!form.assigneeIds.length) return setError('Select at least one assignee.');
    if (!payload.due_date) return setError('A due date is required.');
    if (payload.sla_duration !== null && (!payload.start_date || payload.sla_duration <= 0)) return setError('An SLA needs a start date and a positive duration.');
    setSaving(true);
    try {
      await adminRepository.createTask({ ...payload, assigneeIds: form.assigneeIds, created_by: profile.id });
      setForm(emptyTask); setAssigneeQuery(''); setCreateOpen(false); setNotice('Task created and assigned.');
      await loadTasks(); router.refresh();
    } catch (cause: any) { setError(cause?.message || 'Task could not be created.'); }
    finally { setSaving(false); }
  };
  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); const payload = taskFormPayload(event.currentTarget);
    try { await adminRepository.updateTask(editing.id, { ...payload, start_date: payload.start_date || editing.start_date || '', sla_duration: payload.sla_duration ?? editing.sla_duration ?? null, sla_unit: payload.sla_unit ?? editing.sla_unit ?? null, status: editing.status }); await adminRepository.setTaskAssignees(editing.id, editing.assigneeIds); setEditing(null); setNotice('Task updated.'); await loadTasks(); router.refresh(); }
    catch (cause: any) { setError(cause?.message || 'Task could not be updated.'); }
    finally { setSaving(false); }
  };
  const changeStatus = async (task: any) => {
    const nextStatus = task.status === 'completed' ? 'todo' : 'completed'; const previous = tasks;
    setSaving(true); setError(''); setNotice('');
    setTasks(current => current.map(item => item.id === task.id ? { ...item, status: nextStatus, task_assignments: item.task_assignments.map((assignment: any) => ({ ...assignment, status: nextStatus })) } : item));
    try { await adminRepository.setTaskStatus(task.id, nextStatus); setNotice(task.status === 'completed' ? 'Task reopened.' : 'Task completed.'); await loadTasks(); router.refresh(); }
    catch (cause: any) { setTasks(previous); setError(cause?.message || 'Task update failed.'); }
    finally { setSaving(false); }
  };

  if (loading) return <section className="space-y-5"><div className="h-16 w-80 animate-pulse rounded-xl bg-slate-100" /><div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <div className="h-64 animate-pulse rounded-xl bg-slate-100" key={item} />)}</div></section>;
  if (error && !profile) return <section><p className="text-rose-700">{error}</p><button className="btn btn-primary mt-3" onClick={() => void load()}>Try again</button></section>;

  const today = new Date().toISOString().slice(0, 10);
  const shown = tasks.filter(task => !filter.query || `${task.title} ${task.description || ''}`.toLowerCase().includes(filter.query.toLowerCase()));
  const overdue = shown.filter(task => isOverdue(task, today));
  const dueToday = shown.filter(task => task.due_date === today && task.status !== 'completed' && !isOverdue(task, today));
  const completed = shown.filter(task => task.status === 'completed');
  const priority = ['high', 'medium', 'low'].map(level => ({ level, count: shown.filter(task => task.priority === level).length }));
  const upcoming = shown.filter(task => task.status !== 'completed' && task.due_date && !isOverdue(task, today)).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4);
  const columns = [
    { id: 'overdue', title: 'Overdue', tone: 'border-rose-100 bg-rose-50/45', dot: 'bg-rose-500', tasks: overdue, empty: 'No overdue tasks' },
    { id: 'todo', title: 'To Do', tone: 'border-sky-100 bg-sky-50/45', dot: 'bg-sky-500', tasks: shown.filter(task => task.status === 'todo' && !isOverdue(task, today)), empty: 'No tasks to do' },
    { id: 'in_progress', title: 'In Progress', tone: 'border-amber-100 bg-amber-50/45', dot: 'bg-amber-500', tasks: shown.filter(task => task.status === 'in_progress' && !isOverdue(task, today)), empty: 'No tasks in progress' },
    { id: 'completed', title: 'Completed', tone: 'border-emerald-100 bg-emerald-50/45', dot: 'bg-emerald-500', tasks: completed, empty: 'No completed tasks' },
  ];

  return <section className="mx-auto max-w-[1600px] space-y-5 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Task Management</h1><p className="mt-1 text-sm text-slate-500">Create, assign, reassign, and review staff work.</p></div></header>
    {notice && <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}
    {error && <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800"><p>{error}</p><button className="mt-2 font-semibold underline" onClick={() => void loadTasks()}>Retry task list</button></div>}
    {assigneeError && <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p>{assigneeError}</p><button className="mt-2 font-semibold underline" onClick={() => void load()}>Retry assignee list</button></div>}

    <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <section className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button type="button" className="flex w-full items-center gap-4 p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" aria-expanded={createOpen} onClick={() => setCreateOpen(value => !value)}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-2xl font-light text-teal-700">+</span><span className="min-w-0 flex-1"><b className="block text-base text-slate-900">Create New Task</b><small className="mt-1 block text-sm text-slate-500">Create and assign a new task when needed.</small></span><span className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">{createOpen ? 'Collapse' : 'Open form'} <span aria-hidden="true">›</span></span>
        </button>
        {createOpen && <form className="grid gap-4 border-t border-slate-100 p-5 md:grid-cols-2" onSubmit={submit}>
          <label className="text-sm font-semibold text-slate-700">Task title<input name="title" required className="input mt-1.5" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
          <label className="text-sm font-semibold text-slate-700">Priority<select name="priority" className="input mt-1.5" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="text-sm font-semibold text-slate-700 md:row-span-2">Description<textarea name="description" className="input mt-1.5 min-h-32" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label className="text-sm font-semibold text-slate-700">Start date<input name="start_date" className="input mt-1.5" type="date" value={form.start_date} onChange={event => setForm({ ...form, start_date: event.target.value })} /></label>
          <label className="text-sm font-semibold text-slate-700">Due date<input name="due_date" required className="input mt-1.5" type="date" value={form.due_date} onChange={event => setForm({ ...form, due_date: event.target.value })} /></label>
          <label className="text-sm font-semibold text-slate-700">SLA / expected completion<div className="mt-1.5 grid grid-cols-2 gap-2"><input name="sla_duration" className="input" min="0.25" step="0.25" type="number" placeholder="Optional" value={form.sla_duration} onChange={event => setForm({ ...form, sla_duration: event.target.value })} /><select name="sla_unit" className="input" value={form.sla_unit} onChange={event => setForm({ ...form, sla_unit: event.target.value })}><option value="hours">Hours</option><option value="working_days">Working days</option></select></div></label>
          <div className="text-sm font-semibold text-slate-700"><span>Assignees</span><input className="input mt-1.5" placeholder="Search employees" value={assigneeQuery} onChange={event => setAssigneeQuery(event.target.value)} /><div className="mt-2 flex flex-wrap gap-1.5">{form.assigneeIds.map(id => { const person = staff.find(item => item.id === id); return <button type="button" key={id} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800" onClick={() => toggle(id)}>{person?.full_name || 'Employee'} ×</button>; })}</div><div className="mt-2 max-h-32 overflow-auto rounded-lg border border-slate-200 bg-white">{available.slice(0, 8).map(person => <button type="button" className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50" key={person.id} onClick={() => toggle(person.id)}><b>{person.full_name}</b><span className="ml-2 text-xs font-normal text-slate-500">{person.role?.replace('_', ' ')}{person.designation ? ` · ${person.designation}` : ''}</span></button>)}{!available.length && <p className="p-2 text-xs font-normal text-slate-500">No matching employees.</p>}</div></div>
          <div className="flex justify-end md:col-span-2"><button disabled={saving} className="btn btn-primary min-w-36">{saving ? 'Creating…' : 'Create task'}</button></div>
        </form>}
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Overview</h2><span className="text-xs text-slate-500">Current tasks</span></div><div className="mt-3 grid grid-cols-2 gap-2"><Metric icon="☷" label="Total tasks" count={shown.length} tone="bg-sky-50 text-sky-700" /><Metric icon="◷" label="Overdue" count={overdue.length} tone="bg-rose-50 text-rose-700" /><Metric icon="□" label="Due today" count={dueToday.length} tone="bg-amber-50 text-amber-700" /><Metric icon="✓" label="Completed" count={completed.length} tone="bg-emerald-50 text-emerald-700" /></div><div className="mt-3 rounded-xl border border-slate-100 p-3"><h3 className="text-xs font-bold text-slate-700">Tasks by priority</h3><div className="mt-2 space-y-2">{priority.map(item => <div className="flex items-center justify-between text-xs" key={item.level}><span className="flex items-center gap-2 capitalize"><i className={`h-2 w-2 rounded-full ${item.level === 'high' ? 'bg-rose-500' : item.level === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />{item.level}</span><b>{item.count}</b></div>)}</div></div><div className="mt-3 rounded-xl border border-slate-100 p-3"><h3 className="text-xs font-bold text-slate-700">Upcoming</h3>{upcoming.length ? <div className="mt-1 divide-y divide-slate-100">{upcoming.map(task => <div className="flex items-center justify-between gap-3 py-2 text-xs" key={task.id}><b className="truncate text-slate-700">{task.title}</b><span className="shrink-0 text-slate-500">{dateLabel(task.due_date)}</span></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No upcoming tasks.</p>}</div></aside>
    </div>

    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-5"><input aria-label="Search tasks" className="input h-10 min-w-0" placeholder="⌕  Search tasks" value={filter.query} onChange={event => setFilter({ ...filter, query: event.target.value })} /><select aria-label="Filter by employee" className="input h-10" value={filter.employee} onChange={event => setFilter({ ...filter, employee: event.target.value })}><option value="">All employees</option>{staff.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select><select aria-label="Filter by status" className="input h-10" value={filter.status} onChange={event => setFilter({ ...filter, status: event.target.value })}><option value="">All statuses</option>{Object.entries(labels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select><select aria-label="Filter by priority" className="input h-10" value={filter.priority} onChange={event => setFilter({ ...filter, priority: event.target.value })}><option value="">All priorities</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><input aria-label="Filter by due date" type="date" className="input h-10" value={filter.dueDate} onChange={event => setFilter({ ...filter, dueDate: event.target.value })} /></div>

    {!shown.length ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><b>{tasks.length ? 'No tasks match these filters' : 'No tasks yet'}</b><p className="mt-1 text-sm text-slate-500">{tasks.length ? 'Try changing the filters above.' : 'Create and assign the first task to get started.'}</p>{!tasks.length && <button className="mt-4 text-sm font-semibold text-teal-700" onClick={() => setCreateOpen(true)}>Create New Task</button>}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{columns.map(column => <section className={`rounded-2xl border p-3 ${column.tone}`} key={column.id}><header className="flex items-center justify-between px-1 pb-3"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><i className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />{column.title}</h2><span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-slate-600">{column.tasks.length}</span></header><div className="space-y-3">{column.tasks.map(task => <TaskCard key={task.id} task={task} saving={saving} onEdit={() => setEditing({ ...task, assigneeIds: task.task_assignments.map((assignment: any) => assignment.profile_id) })} onStatus={() => void changeStatus(task)} />)}{!column.tasks.length && <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-5 text-center text-xs text-slate-500">{column.empty}</p>}</div></section>)}</div>}

    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"><form className="card max-h-[90vh] w-full max-w-xl overflow-auto p-5" onSubmit={saveEdit}><button type="button" className="float-right text-sm underline" onClick={() => setEditing(null)}>Close</button><h2 className="text-xl font-bold">Edit task</h2><div className="mt-4 grid gap-3"><input name="title" required className="input" value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /><textarea name="description" className="input min-h-20" value={editing.description || ''} onChange={event => setEditing({ ...editing, description: event.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><select name="priority" className="input" value={editing.priority} onChange={event => setEditing({ ...editing, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><input name="start_date" className="input" type="date" value={editing.start_date || ''} onChange={event => setEditing({ ...editing, start_date: event.target.value })} /><input name="due_date" required className="input" type="date" value={editing.due_date || ''} onChange={event => setEditing({ ...editing, due_date: event.target.value })} /><div className="grid grid-cols-2 gap-2"><input name="sla_duration" className="input" min="0.25" step="0.25" type="number" placeholder="SLA" value={editing.sla_duration || ''} onChange={event => setEditing({ ...editing, sla_duration: event.target.value })} /><select name="sla_unit" className="input" value={editing.sla_unit || 'working_days'} onChange={event => setEditing({ ...editing, sla_unit: event.target.value })}><option value="hours">Hours</option><option value="working_days">Working days</option></select></div></div><label className="text-sm">Assignees<div className="mt-1 max-h-48 overflow-auto rounded border">{staff.map(person => <label className="flex gap-2 border-b p-2" key={person.id}><input type="checkbox" checked={editing.assigneeIds.includes(person.id)} onChange={() => setEditing({ ...editing, assigneeIds: editing.assigneeIds.includes(person.id) ? editing.assigneeIds.filter((id: string) => id !== person.id) : [...editing.assigneeIds, person.id] })} />{person.full_name}<small className="text-slate-500">{person.role?.replace('_', ' ')}</small></label>)}</div></label><button disabled={saving || !editing.assigneeIds.length} className="btn btn-primary">{saving ? 'Saving…' : 'Save task'}</button></div></form></div>}
  </section>;
}

function Metric({ icon, label, count, tone }: { icon: string; label: string; count: number; tone: string }) { return <div className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5"><span className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-bold ${tone}`}>{icon}</span><span><b className="block text-sm leading-none text-slate-900">{count}</b><small className="mt-1 block text-[11px] text-slate-500">{label}</small></span></div>; }
function TaskCard({ task, saving, onEdit, onStatus }: { task: any; saving: boolean; onEdit: () => void; onStatus: () => void }) {
  const latest = task.task_comments?.at(-1); const assigned = task.task_assignments?.[0]?.profile; const health = taskHealth(task, { timezone: 'Asia/Kolkata' }); const overdue = health === 'overdue'; const completed = task.status === 'completed';
  const priorityTone = task.priority === 'high' ? 'text-rose-700' : task.priority === 'medium' ? 'text-amber-700' : 'text-emerald-700';
  return <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><h3 className="min-w-0 text-sm font-bold text-slate-900">{task.title}</h3>{(overdue || completed) && <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${overdue ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{overdue ? 'Overdue' : 'Completed'}</span>}</div><p className="mt-2 text-xs text-slate-500">Due: {dateLabel(task.due_date)} <span className="mx-1">•</span> <span className={`font-semibold capitalize ${priorityTone}`}>{task.priority}</span></p><p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{task.description || 'No description provided.'}</p>{assigned && <div className="mt-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-slate-700 text-[10px] font-bold text-white">{initials(assigned.full_name)}</span><span className="min-w-0"><b className="block truncate text-[11px] text-slate-700">{assigned.full_name}</b><small className="block truncate text-[10px] text-slate-500">{assigned.designation || assigned.role?.replace('_', ' ') || 'Assignee'}</small></span></div>}<div className="mt-3 flex items-center justify-between text-[11px] text-slate-500"><span>◌ {task.task_comments?.length || 0} comments</span><span>{latest ? 'Latest update' : 'Created by management'}</span></div>{latest && <p className="mt-2 line-clamp-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{latest.body}</p>}<div className="mt-3 flex gap-2"><button className="btn flex-1 border px-2 py-1.5 text-[11px]" onClick={onEdit}>Edit / Reassign</button><button disabled={saving} className="btn btn-primary flex-1 px-2 py-1.5 text-[11px]" onClick={onStatus}>{saving ? 'Updating…' : completed ? 'Reopen' : 'Complete'}</button></div></article>;
}
