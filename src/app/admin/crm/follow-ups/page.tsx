'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { adminRepository } from '@/lib/admin-repository';

const day = () => new Date().toISOString().slice(0, 10);
const stateFor = (followup: any) => {
  const next = String(followup.next_follow_up_at || '').slice(0, 10);
  if (followup.outcome) return 'Completed';
  if (!next) return 'No next date';
  if (next < day()) return 'Overdue';
  if (next === day()) return 'Today';
  return 'Upcoming';
};

export default function FollowupsPage() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [filters, setFilters] = useState({ query: '', date: '', state: '' });
  const load = async () => { try { setLoading(true); setError(''); const leads = await adminRepository.crmLeads(); setItems((leads || []).flatMap((lead: any) => (lead.crm_lead_followups || []).map((followup: any) => ({ ...followup, lead })))); } catch { setError('Follow-ups could not be loaded. Please try again.'); } finally { setLoading(false); } };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const shown = useMemo(() => items.filter(item => { const due = String(item.next_follow_up_at || '').slice(0, 10); return (!filters.query || [item.lead?.full_name, item.lead?.phone, item.note, item.outcome].some(value => String(value || '').toLowerCase().includes(filters.query.toLowerCase()))) && (!filters.date || due === filters.date) && (!filters.state || stateFor(item) === filters.state); }), [items, filters]);
  return <section className="mx-auto max-w-[1320px] space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">CRM</p><h1 className="text-2xl font-bold">Follow-ups</h1><p className="mt-1 text-sm text-slate-600">Management-wide follow-up queue. Open a lead to add, complete, reschedule, or edit its follow-ups.</p></div><Link className="btn btn-primary" href="/admin/crm">Open leads</Link></div>{error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}<button className="ml-3 font-semibold underline" onClick={() => void load()}>Retry</button></p>}<div className="grid gap-2 rounded-xl border bg-white p-3 md:grid-cols-3"><input className="input" placeholder="Search lead, note, or outcome" value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} /><input className="input" type="date" aria-label="Follow-up date" value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value })} /><select className="input" value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value })}><option value="">All states</option>{['Today', 'Overdue', 'Upcoming', 'Completed', 'No next date'].map(state => <option key={state}>{state}</option>)}</select></div><div className="card overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Lead', 'Follow-up', 'Note / outcome', 'Next follow-up', 'State', 'Action'].map(label => <th className="px-4 py-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{loading ? <tr><td className="px-4 py-6" colSpan={6}>Loading follow-ups…</td></tr> : shown.map(item => <tr className="border-t border-slate-100" key={item.id}><td className="px-4 py-3"><b>{item.lead?.full_name || 'Lead'}</b><small className="block text-slate-500">{item.lead?.phone || 'No phone'}</small></td><td className="px-4 py-3">#{item.followup_number || '—'}<small className="block text-slate-500">{item.follow_up_at ? new Date(item.follow_up_at).toLocaleString() : 'Not scheduled'}</small></td><td className="px-4 py-3">{item.note || '—'}<small className="block text-slate-500">{item.outcome || 'No outcome'}</small></td><td className="px-4 py-3">{item.next_follow_up_at ? new Date(item.next_follow_up_at).toLocaleString() : '—'}</td><td className="px-4 py-3">{stateFor(item)}</td><td className="px-4 py-3"><Link className="font-semibold text-teal-700 hover:underline" href={`/admin/crm/leads/${item.lead_id}`}>Open lead</Link></td></tr>)}</tbody></table>{!loading && !shown.length && <p className="p-8 text-center text-sm text-slate-500">No follow-ups match these filters.</p>}</div></section>;
}
