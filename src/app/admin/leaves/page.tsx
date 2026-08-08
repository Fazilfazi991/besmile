'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminRepository } from '@/lib/admin-repository';
import { employeeRepository } from '@/lib/employee-repository';
import { currentProfile } from '@/lib/auth';

const displayDate = (value?: string) => value ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '-';

export default function LeaveApprovalsPage() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get('request') || '';
  const [profile, setProfile] = useState<any>();
  const [requests, setRequests] = useState<any[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'pending' | 'all'>(() => requestId ? 'all' : 'pending');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const user = await currentProfile() as any;
      if (!user) throw new Error('Your session has expired.');
      const allowed = await Promise.all(['leave.approve', 'leave.manage', 'leave.review'].map(code => employeeRepository.hasPermission(code)));
      if (!allowed.some(Boolean)) throw new Error('You do not have permission to review leave requests.');
      setProfile(user);
      setRequests(await adminRepository.leaveRequests());
      setError('');
    } catch (cause: any) {
      setError(cause.message || 'Leave requests could not be loaded.');
    }
  };

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (!requestId) return; window.setTimeout(() => document.getElementById(`leave-request-${requestId}`)?.scrollIntoView({ block: 'center' }), 100); }, [requestId, requests.length]);

  const visible = useMemo(() => filter === 'pending' ? requests.filter(request => request.status === 'pending') : requests, [filter, requests]);
  const linkedRequestMissing = requestId && requests.length > 0 && !requests.some(request => request.id === requestId);

  const review = async (id: string, status: 'approved' | 'rejected') => {
    if (!profile) return;
    setBusy(id);
    setError('');
    try {
      await adminRepository.reviewLeaveRequest(id, status, comments[id] || '', profile.id);
      await load();
    } catch (cause: any) {
      setError(cause.message || 'Leave review could not be saved.');
    } finally {
      setBusy(undefined);
    }
  };

  return <section className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">WORK MANAGEMENT</p><h1 className="text-2xl font-bold">Leave approvals</h1><p className="text-slate-600">Review pending employee leave requests and record a decision.</p></div><label className="text-sm font-medium">Show <select className="input ml-2 h-10 py-2" value={filter} onChange={event => setFilter(event.target.value as 'pending' | 'all')}><option value="pending">Pending only</option><option value="all">All requests</option></select></label></header>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {linkedRequestMissing && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This request is no longer available.</p>}
    <div className="card overflow-hidden">
      <div className="border-b px-5 py-4"><b>{visible.length} {filter === 'pending' ? 'pending ' : ''}request{visible.length === 1 ? '' : 's'}</b></div>
      {visible.length === 0 ? <p className="p-6 text-sm text-slate-600">No leave requests match this view.</p> : <div className="divide-y">{visible.map(request => <article className={`space-y-3 p-5 ${request.id === requestId ? 'bg-amber-50 ring-2 ring-inset ring-amber-300' : ''}`} id={`leave-request-${request.id}`} key={request.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><b>{request.employee?.full_name || 'Employee'}</b><p className="text-sm text-slate-600">{request.employee?.employee_code || request.employee?.email || 'Employee profile'} - {request.employee?.designation || 'Employee'}</p><p className="mt-2 font-medium">{request.leave_types?.name || request.leave_type || 'Leave'} - {displayDate(request.starts_on)} - {displayDate(request.ends_on)}</p><p className="mt-1 text-sm text-slate-700">{request.reason || 'No reason provided.'}</p><p className="mt-1 text-xs text-slate-500">{Number(request.requested_days || 0)} day(s){request.half_day ? ' - Half day' : ''}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : request.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{request.status}</span></div>{request.status === 'pending' ? <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row"><input aria-label={`Approval comment for ${request.employee?.full_name || request.id}`} className="input min-w-0 flex-1" placeholder="Approval comment (optional)" value={comments[request.id] || ''} onChange={event => setComments({ ...comments, [request.id]: event.target.value })} /><button className="btn btn-primary" disabled={busy === request.id} onClick={() => void review(request.id, 'approved')}>Approve</button><button className="btn border border-rose-300 text-rose-700" disabled={busy === request.id} onClick={() => void review(request.id, 'rejected')}>Reject</button></div> : <p className="border-t pt-3 text-sm text-slate-600"><b>Review comment:</b> {request.approval_comment || '-'}</p>}</article>)}</div>}
    </div>
  </section>;
}
