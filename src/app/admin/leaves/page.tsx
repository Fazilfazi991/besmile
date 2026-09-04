'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CompactEmptyState, CompactPageHeader, DataTableShell, ModuleTabs, ModuleToolbar, Pagination, StatusBadge } from '@/components/compact-module';
import { adminRepository } from '@/lib/admin-repository';
import { employeeRepository } from '@/lib/employee-repository';
import { currentProfile } from '@/lib/auth';
import { canReviewLeaveRequest } from '@/lib/leave-rules';
import { filterLeaveRequests, paginateRecords, type LeaveStatusFilter } from '@/lib/leave-workspace';

const displayDate = (value?: string) => value ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '—';
const displayDateTime = (value?: string) => value ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const statusValues: LeaveStatusFilter[] = ['all', 'pending', 'approved', 'rejected', 'cancelled'];

export default function LeaveApprovalsPage() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get('request') || '';
  const [profile, setProfile] = useState<any>();
  const [requests, setRequests] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<LeaveStatusFilter>(() => requestId ? 'all' : 'pending');
  const [query, setQuery] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [busy, setBusy] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const user = await currentProfile() as any;
      if (!user) throw new Error('Your session has expired.');
      const allowed = await Promise.all(['leave.approve', 'leave.manage', 'leave.review'].map(code => employeeRepository.hasPermission(code)));
      if (!allowed.some(Boolean)) throw new Error('You do not have permission to review leave requests.');
      const nextRequests = (await adminRepository.leaveRequests()).filter((request: any) => request.profile_id !== user.id);
      setProfile(user);
      setRequests(nextRequests);
      setSelected((current: any) => {
        const selectedId = current?.id || requestId;
        return selectedId ? nextRequests.find((request: any) => request.id === selectedId) : undefined;
      });
      setError('');
    } catch (cause: any) {
      setError(cause.message || 'Leave requests could not be loaded. Refresh the page to try again.');
    } finally { setLoading(false); }
  }, [requestId]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(undefined); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [selected]);

  const counts = useMemo(() => Object.fromEntries(statusValues.map(value => [value, value === 'all' ? requests.length : requests.filter(request => request.status === value).length])), [requests]);
  const leaveTypes = useMemo(() => Array.from(new Set(requests.map(request => request.leave_types?.name || request.leave_type).filter(Boolean))).sort() as string[], [requests]);
  const filtered = useMemo(() => filterLeaveRequests(requests, { status, query, leaveType }), [requests, status, query, leaveType]);
  const pagination = useMemo(() => paginateRecords(filtered, page, pageSize), [filtered, page, pageSize]);
  const linkedRequestMissing = requestId && !loading && requests.length > 0 && !requests.some(request => request.id === requestId);

  const resetFilters = () => { setQuery(''); setLeaveType(''); setStatus('all'); setPage(1); };
  const review = async (id: string, decision: 'approved' | 'rejected') => {
    if (!profile) return;
    setBusy(id); setError('');
    try { await adminRepository.reviewLeaveRequest(id, decision, comments[id] || ''); await load(); }
    catch (cause: any) { setError(cause.message || 'Leave review could not be saved. Try again.'); }
    finally { setBusy(undefined); }
  };

  const tabs = statusValues.map(value => ({ value, label: value === 'all' ? 'All' : `${value[0].toUpperCase()}${value.slice(1)}`, count: counts[value] || 0 }));
  const selectedCanReview = selected && canReviewLeaveRequest({ reviewerId: profile?.id, reviewerRole: profile?.role, requesterId: selected.profile_id, requesterRole: selected.employee?.role, status: selected.status });

  return <section className="compact-module leave-workspace">
    <CompactPageHeader title="Leave management" description="Review employee requests, filter the queue, and record decisions." />
    <div className="module-summary-strip" aria-label="Leave request summary">
      <div><span>Pending</span><b>{counts.pending || 0}</b></div><div><span>Approved</span><b>{counts.approved || 0}</b></div><div><span>Rejected</span><b>{counts.rejected || 0}</b></div><div><span>Total requests</span><b>{counts.all || 0}</b></div>
    </div>
    {error ? <p role="alert" className="module-alert module-alert-error">{error}</p> : null}
    {linkedRequestMissing ? <p role="status" className="module-alert module-alert-warning">This request is no longer available.</p> : null}
    <ModuleTabs tabs={tabs} value={status} onChange={value => { setStatus(value); setPage(1); }} label="Leave request status" />
    <ModuleToolbar>
      <label className="module-search"><span className="sr-only">Search leave requests</span><input className="input" type="search" placeholder="Search employee, code, or role" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      <label><span className="sr-only">Leave type</span><select className="input" value={leaveType} onChange={event => { setLeaveType(event.target.value); setPage(1); }}><option value="">All leave types</option>{leaveTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
      <button type="button" className="btn module-reset" disabled={!query && !leaveType && status === 'all'} onClick={resetFilters}>Reset filters</button>
    </ModuleToolbar>
    <DataTableShell label="Leave requests">
      <table className="module-table"><thead><tr><th>Employee</th><th>Leave type</th><th>Dates</th><th>Duration</th><th>Status</th><th>Requested</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {loading ? Array.from({ length: 6 }, (_, index) => <tr className="module-skeleton-row" key={index}><td colSpan={7}><span /></td></tr>) : null}
        {!loading && pagination.records.map(request => <tr className={request.id === requestId ? 'linked-record' : ''} id={`leave-request-${request.id}`} key={request.id}>
          <td data-private><b>{request.employee?.full_name || 'Employee'}</b><small>{request.employee?.employee_code || request.employee?.designation || 'Employee profile'}</small></td>
          <td>{request.leave_types?.name || request.leave_type || 'Leave'}</td>
          <td><b>{displayDate(request.starts_on)}</b><small>to {displayDate(request.ends_on)}</small></td>
          <td>{Number(request.requested_days || 0)} day{Number(request.requested_days || 0) === 1 ? '' : 's'}{request.half_day ? <small>Half day</small> : null}</td>
          <td><StatusBadge status={request.status} /></td><td>{displayDateTime(request.created_at)}</td>
          <td><button type="button" className="module-view" onClick={() => setSelected(request)} aria-label={`View leave request for ${request.employee?.full_name || 'employee'}`}>View</button></td>
        </tr>)}
        {!loading && filtered.length === 0 ? <tr><td colSpan={7}><CompactEmptyState title={`No ${status === 'all' ? '' : `${status} `}leave requests`} description="Adjust the filters or choose another status to see more requests." /></td></tr> : null}
      </tbody></table>
      <div className="module-mobile-records">
        {loading ? Array.from({ length: 4 }, (_, index) => <div className="module-mobile-skeleton" key={index} />) : null}
        {!loading && pagination.records.map(request => <article key={request.id} className={request.id === requestId ? 'linked-record' : ''}><div><b data-private>{request.employee?.full_name || 'Employee'}</b><StatusBadge status={request.status} /></div><p>{request.leave_types?.name || request.leave_type || 'Leave'} · {Number(request.requested_days || 0)} day{Number(request.requested_days || 0) === 1 ? '' : 's'}</p><small>{displayDate(request.starts_on)} – {displayDate(request.ends_on)}</small><button type="button" className="module-view" onClick={() => setSelected(request)}>View details</button></article>)}
        {!loading && filtered.length === 0 ? <CompactEmptyState title={`No ${status === 'all' ? '' : `${status} `}leave requests`} description="Adjust the filters or choose another status to see more requests." /> : null}
      </div>
      {!loading ? <Pagination page={pagination.page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /> : null}
    </DataTableShell>
    {selected ? <div className="leave-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(undefined); }}><aside className="leave-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="leave-detail-title">
      <header><div><StatusBadge status={selected.status} /><h2 id="leave-detail-title">Leave request</h2></div><button type="button" onClick={() => setSelected(undefined)} aria-label="Close leave request details">Close</button></header>
      <div className="leave-requester" data-private><b>{selected.employee?.full_name || 'Employee'}</b><p>{selected.employee?.employee_code || selected.employee?.email || 'Employee profile'} · {selected.employee?.designation || 'Employee'}</p></div>
      <dl className="leave-detail-grid"><div><dt>Leave type</dt><dd>{selected.leave_types?.name || selected.leave_type || 'Leave'}</dd></div><div><dt>Duration</dt><dd>{Number(selected.requested_days || 0)} day{Number(selected.requested_days || 0) === 1 ? '' : 's'}{selected.half_day ? ' · Half day' : ''}</dd></div><div><dt>Starts</dt><dd>{displayDate(selected.starts_on)}</dd></div><div><dt>Ends</dt><dd>{displayDate(selected.ends_on)}</dd></div><div><dt>Requested</dt><dd>{displayDateTime(selected.created_at)}</dd></div></dl>
      <section className="leave-detail-reason"><h3>Reason</h3><p>{selected.reason || 'No reason provided.'}</p></section>
      {!selectedCanReview && selected.status !== 'pending' ? <section className="leave-detail-reason"><h3>Review comment</h3><p>{selected.approval_comment || 'No review comment.'}</p></section> : null}
      {selectedCanReview ? <footer><label htmlFor={`approval-comment-${selected.id}`}>Approval comment <span>(optional)</span></label><textarea id={`approval-comment-${selected.id}`} className="input" rows={3} value={comments[selected.id] || ''} onChange={event => setComments(current => ({ ...current, [selected.id]: event.target.value }))} /><div><button className="btn btn-primary" disabled={busy === selected.id} onClick={() => void review(selected.id, 'approved')}>{busy === selected.id ? 'Saving…' : 'Approve'}</button><button className="btn leave-reject" disabled={busy === selected.id} onClick={() => void review(selected.id, 'rejected')}>Reject</button></div></footer> : selected.status === 'pending' ? <p className="leave-review-note">This request cannot be reviewed from your account.</p> : null}
    </aside></div> : null}
  </section>;
}
