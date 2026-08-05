'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminRepository } from '@/lib/admin-repository';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { isOverdue } from '@/lib/task-rules';

const labels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', completed: 'Completed' };
const emptyTask = { title: '', description: '', priority: 'medium', due_date: '', assigneeIds: [] as string[] };
const taskFormPayload = (form: HTMLFormElement) => {
  const data = Object.fromEntries(new FormData(form));
  return {
    title: String(data.title || '').trim(),
    description: String(data.description || ''),
    priority: String(data.priority || 'medium'),
    due_date: String(data.due_date || ''),
  };
};

export default function AdminTasksPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>();
  const [staff, setStaff] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState({ employee: '', status: '', priority: '', dueDate: '', query: '' });
  const [form, setForm] = useState(emptyTask);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [editing, setEditing] = useState<any>();
  const [error, setError] = useState('');
  const [assigneeError, setAssigneeError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadTasks = async () => {
    try {
      setTasks(await adminRepository.tasks(filter));
      setError('');
    } catch (cause: any) {
      setError(cause?.message || 'Task list could not be loaded. Please try again.');
    }
  };
  const load = async () => {
    setLoading(true);
    try {
      const p = await currentProfile() as any;
      const canManage = await Promise.all(['tasks.manage', 'tasks.assign'].map((permission) => employeeRepository.hasPermission(permission)));
      if (!p || !canManage.some(Boolean)) throw Error('You do not have permission to manage tasks.');
      setProfile(p);
      const [employees, allTasks] = await Promise.allSettled([adminRepository.employees('', 0, 100), adminRepository.tasks(filter)]);
      if (employees.status === 'fulfilled') {
        setStaff(employees.value.data);
        setAssigneeError('');
      } else setAssigneeError('Assignee list could not be loaded. Existing tasks are still available.');
      if (allTasks.status === 'fulfilled') {
        setTasks(allTasks.value);
        setError('');
      } else setError(allTasks.reason?.message || 'Task list could not be loaded. Please try again.');
    } catch (e: any) {
      setError(e.message || 'Tasks could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.employee, filter.status, filter.priority, filter.dueDate]);
  useEffect(() => {
    const refreshOnFocus = () => void loadTasks();
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.employee, filter.status, filter.priority, filter.dueDate]);

  const available = useMemo(
    () => staff.filter((person) => !form.assigneeIds.includes(person.id) && `${person.full_name} ${person.email}`.toLowerCase().includes(assigneeQuery.toLowerCase())),
    [staff, form.assigneeIds, assigneeQuery],
  );
  const toggle = (id: string) => setForm((current) => ({
    ...current,
    assigneeIds: current.assigneeIds.includes(id) ? current.assigneeIds.filter((value) => value !== id) : [...current.assigneeIds, id],
  }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const payload = taskFormPayload(event.currentTarget);
    if (!payload.title) return setError('Task title is required.');
    if (!form.assigneeIds.length) return setError('Select at least one assignee.');
    if (!payload.due_date) return setError('A due date is required.');
    setSaving(true);
    try {
      await adminRepository.createTask({ ...payload, assigneeIds: form.assigneeIds, created_by: profile.id });
      setForm(emptyTask);
      setAssigneeQuery('');
      setNotice('Task created and assigned.');
      await loadTasks();
      router.refresh();
    } catch (e: any) {
      setError(e.message || 'Task could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = taskFormPayload(event.currentTarget);
    try {
      await adminRepository.updateTask(editing.id, { ...payload, status: editing.status });
      await adminRepository.setTaskAssignees(editing.id, editing.assigneeIds);
      setEditing(null);
      setNotice('Task updated.');
      await loadTasks();
      router.refresh();
    } catch (e: any) {
      setError(e.message || 'Task could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading task management...</p>;
  if (error && !profile) {
    return (
      <section>
        <p className="text-rose-700">{error}</p>
        <button className="btn btn-primary mt-3" onClick={() => void load()}>Try again</button>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Task Management</h1>
        <p className="text-slate-600">Create, assign, reassign, and review staff work.</p>
      </div>

      {notice && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
      {error && <div className="rounded bg-rose-50 p-3 text-rose-800"><p>{error}</p><button className="mt-2 font-semibold underline" onClick={() => void loadTasks()}>Retry task list</button></div>}
      {assigneeError && <div className="rounded bg-amber-50 p-3 text-amber-900"><p>{assigneeError}</p><button className="mt-2 font-semibold underline" onClick={() => void load()}>Retry assignee list</button></div>}

      <form className="card grid gap-3 p-5 md:grid-cols-2" onSubmit={submit}>
        <h2 className="font-bold md:col-span-2">Create task</h2>
        <label className="text-sm font-medium">
          Task title
          <input name="title" required className="input mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Priority
          <select name="priority" className="input mt-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Description
          <textarea name="description" className="input mt-1 min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Due date
          <input name="due_date" required className="input mt-1" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </label>
        <div className="text-sm font-medium">
          <span>Assignees</span>
          <input className="input mt-1" placeholder="Search employees" value={assigneeQuery} onChange={(e) => setAssigneeQuery(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {form.assigneeIds.map((id) => {
              const person = staff.find((item) => item.id === id);
              return (
                <button type="button" key={id} className="rounded-full bg-teal-50 px-2 py-1 text-xs text-teal-800" onClick={() => toggle(id)}>
                  {person?.full_name || 'Employee'} x
                </button>
              );
            })}
          </div>
          <div className="mt-2 max-h-32 overflow-auto rounded border bg-white">
            {available.slice(0, 8).map((person) => (
              <button type="button" className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50" key={person.id} onClick={() => toggle(person.id)}>
                <b>{person.full_name}</b>
                <span className="ml-2 text-xs text-slate-500">
                  {person.role?.replace('_', ' ')}
                  {person.designation ? ` - ${person.designation}` : ''}
                </span>
              </button>
            ))}
            {!available.length && <p className="p-2 text-xs text-slate-500">No matching employees.</p>}
          </div>
        </div>
        <button disabled={saving} className="btn btn-primary md:col-span-2">{saving ? 'Creating...' : 'Create task'}</button>
      </form>

      <div className="card grid gap-2 p-4 md:grid-cols-5">
        <input className="input" placeholder="Search tasks" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
        <select className="input" value={filter.employee} onChange={(e) => setFilter({ ...filter, employee: e.target.value })}>
          <option value="">All employees</option>
          {staff.map((person) => <option value={person.id} key={person.id}>{person.full_name}</option>)}
        </select>
        <select className="input" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(labels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
        </select>
        <select className="input" value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input type="date" className="input" value={filter.dueDate} onChange={(e) => setFilter({ ...filter, dueDate: e.target.value })} />
      </div>

      <div className="space-y-3">
        {tasks.filter((task) => !filter.query || `${task.title} ${task.description || ''}`.toLowerCase().includes(filter.query.toLowerCase())).map((task) => {
          const latest = task.task_comments?.at(-1);
          return (
            <article className="card p-4" key={task.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <b>{task.title}</b>
                  <p className="mt-1 text-sm text-slate-600">
                    {task.task_assignments.map((a: any) => a.profile?.full_name).filter(Boolean).join(', ') || 'Unassigned'} - Due {task.due_date || 'No due date'} - <span className="capitalize">{task.priority}</span>
                  </p>
                  <p className="text-sm">{task.description}</p>
                  <p className="mt-1 text-xs text-slate-500">Created by {task.created_by_profile?.full_name || 'Management'}</p>
                  {latest && <p className="mt-2 text-sm text-slate-600"><b>Latest update:</b> {latest.body}</p>}
                </div>
                <div className="flex h-fit flex-wrap gap-2">
                  {isOverdue(task) && <span className="rounded bg-rose-100 px-2 py-1 text-xs text-rose-800">Overdue</span>}
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs">{labels[task.status]}</span>
                  <button className="btn border px-2 py-1 text-xs" onClick={() => setEditing({ ...task, assigneeIds: task.task_assignments.map((a: any) => a.profile_id) })}>Edit / reassign</button>
                  <button disabled={saving} className="btn border px-2 py-1 text-xs" onClick={async () => {
                    const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
                    const previous = tasks;
                    setSaving(true);
                    setError('');
                    setNotice('');
                    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus, task_assignments: item.task_assignments.map((assignment: any) => ({ ...assignment, status: nextStatus })) } : item));
                    try {
                      await adminRepository.setTaskStatus(task.id, nextStatus);
                      setNotice(task.status === 'completed' ? 'Task reopened.' : 'Task completed.');
                      await loadTasks();
                      router.refresh();
                    } catch (e: any) {
                      setTasks(previous);
                      setError(e.message || 'Task update failed.');
                    } finally {
                      setSaving(false);
                    }
                  }}>
                    {saving ? 'Updating...' : task.status === 'completed' ? 'Reopen' : 'Complete'}
                  </button>
                </div>
              </div>
              {task.task_comments?.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-brand">View comments ({task.task_comments.length})</summary>
                  {task.task_comments.map((comment: any) => <p className="mt-2 border-l-2 pl-2" key={comment.id}><b>{comment.author_profile?.full_name || 'Employee'}:</b> {comment.body}</p>)}
                </details>
              )}
            </article>
          );
        })}
        {!tasks.length && <p className="card p-5 text-slate-600">No tasks found.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <form className="card max-h-[90vh] w-full max-w-xl overflow-auto p-5" onSubmit={saveEdit}>
            <button type="button" className="float-right text-sm underline" onClick={() => setEditing(null)}>Close</button>
            <h2 className="text-xl font-bold">Edit task</h2>
            <div className="mt-4 grid gap-3">
              <input name="title" required className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <textarea name="description" className="input min-h-20" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <select name="priority" className="input" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <input name="due_date" required className="input" type="date" value={editing.due_date || ''} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
              </div>
              <label className="text-sm">
                Assignees
                <div className="mt-1 max-h-48 overflow-auto rounded border">
                  {staff.map((person) => (
                    <label className="flex gap-2 border-b p-2" key={person.id}>
                      <input type="checkbox" checked={editing.assigneeIds.includes(person.id)} onChange={() => setEditing({ ...editing, assigneeIds: editing.assigneeIds.includes(person.id) ? editing.assigneeIds.filter((id: string) => id !== person.id) : [...editing.assigneeIds, person.id] })} />
                      {person.full_name}
                      <small className="text-slate-500">{person.role?.replace('_', ' ')}</small>
                    </label>
                  ))}
                </div>
              </label>
              <button disabled={saving || !editing.assigneeIds.length} className="btn btn-primary">{saving ? 'Saving...' : 'Save task'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
