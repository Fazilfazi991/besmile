'use client';

import { useEffect, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';

const labels: Record<string, string> = {
  task_assigned: 'Task Assigned', task_updated: 'Task Updated', leave_approved: 'Leave Approved', leave_rejected: 'Leave Rejected',
  document_requested: 'Document Requested', document_approved: 'Document Approved', document_rejected: 'Document Rejected', new_announcement: 'New Announcement',
};
const employeeNotificationLink = (link?: string | null) => link?.startsWith('/employee/') ? link : '/employee/notifications';

export default function NotificationsPage() {
  const [profile, setProfile] = useState<any>(); const [items, setItems] = useState<any[]>([]); const [query, setQuery] = useState(''); const [type, setType] = useState(''); const [detail, setDetail] = useState<any>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const p = await currentProfile() as any; if (!p) throw Error('Your session has expired.'); setProfile(p); setItems(await employeeRepository.notifications(p.id)); setError(''); } catch (e: any) { setError(e.message || 'Unable to load notifications.'); } finally { setLoading(false); } };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
  const read = async (item: any) => { if (!item.read_at) { await employeeRepository.markNotificationRead(item.id, profile.id); setItems(items.map(x => x.id === item.id ? { ...x, read_at: new Date().toISOString() } : x)); } setDetail(item); };
  if (loading) return <section><h1 className="text-2xl font-bold">Notifications</h1><p className="mt-3 text-slate-600">Loading notifications...</p></section>;
  if (error && !profile) return <section><h1 className="text-2xl font-bold">Notifications</h1><p className="mt-3 text-rose-700">{error}</p></section>;
  const types = [...new Set(items.map(item => item.type))]; const shown = items.filter(item => (!type || item.type === type) && (`${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase()))); const unread = items.filter(item => !item.read_at).length;
  return <section className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Notifications {unread ? `(${unread})` : ''}</h1><p className="text-slate-600">Updates about your work and company.</p></div>{unread > 0 && <button className="rounded border px-3 py-2 text-sm" onClick={async () => { await employeeRepository.markAllNotificationsRead(profile.id); await load(); }}>Mark all as read</button>}</div>{error && <p className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}<div className="flex gap-2"><input className="rounded border p-2" placeholder="Search notifications" value={query} onChange={e => setQuery(e.target.value)} /><select className="rounded border p-2" value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{types.map(value => <option value={value} key={value}>{labels[value] || value}</option>)}</select></div>{shown.length ? <div className="card overflow-hidden">{shown.map(item => <button onClick={() => void read(item)} className={`block w-full border-b p-4 text-left ${item.read_at ? 'bg-white' : 'bg-sky-50'}`} key={item.id}><div className="flex justify-between gap-3"><div><b>{item.title}</b><p className="text-sm text-slate-600">{item.body}</p><small className="text-slate-500">{labels[item.type] || item.type} - {new Date(item.created_at).toLocaleString()}</small></div>{!item.read_at && <span className="h-fit rounded-full bg-brand px-2 py-1 text-xs text-white">New</span>}</div></button>)}</div> : <div className="card p-6 text-slate-600">No notifications found.</div>}{detail && <div className="card p-5"><button className="float-right text-sm underline" onClick={() => setDetail(null)}>Close</button><h2 className="text-lg font-bold">{detail.title}</h2><p className="mt-2">{detail.body}</p>{detail.deep_link && <a href={employeeNotificationLink(detail.deep_link)} className="mt-3 inline-block text-sm underline">Open related item</a>}</div>}</section>;
}
