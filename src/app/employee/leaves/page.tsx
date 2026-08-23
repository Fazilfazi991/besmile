'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { validateLeaveRequestDates } from '@/lib/leave-rules';

const statusClass: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};
const today = new Date().toISOString().slice(0, 10);

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${value}T12:00:00`))
    : '-';

function leaveErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message;
    if (/invalid input syntax for type date|date.*empty/i.test(message)) return 'Select a start date and an end date.';
    return message;
  }
  return typeof error === 'string'
    ? error
    : 'Failed to submit the leave request. Please try again.';
}

export default function LeavesPage() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get('request') || '';
  const [profile, setProfile] = useState<any>();
  const [types, setTypes] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [form, setForm] = useState({
    leave_type_id: '',
    starts_on: '',
    ends_on: '',
    reason: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const employee = (await currentProfile()) as any;
      if (!employee) throw Error('Your session has expired.');
      const [leaveTypes, leaveHistory] = await Promise.all([
        employeeRepository.leaveTypes(),
        employeeRepository.leaveHistory(employee.id),
      ]);
      setProfile(employee);
      setTypes(leaveTypes);
      setRequests(
        leaveHistory.filter((request: any) =>
          ['pending', 'approved', 'rejected'].includes(request.status),
        ),
      );
      setForm((current) => ({
        ...current,
        leave_type_id: current.leave_type_id || leaveTypes[0]?.id || '',
      }));
    } catch (loadError: unknown) {
      setError(leaveErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (!requestId) return; window.setTimeout(() => document.getElementById(`leave-request-${requestId}`)?.scrollIntoView({ block: 'center' }), 100); }, [requestId, requests.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const dateError = validateLeaveRequestDates(form.starts_on, form.ends_on);
    if (dateError) { setError(dateError); return; }
    setSubmitting(true);
    try {
      if (!profile) throw Error('Your session has expired.');
      await employeeRepository.requestLeave({
        ...form,
        profile_id: profile.id,
        half_day: false,
      });
      setNotice('Leave request submitted successfully.');
      setForm({
        leave_type_id: types[0]?.id || '',
        starts_on: '',
        ends_on: '',
        reason: '',
      });
      await load();
    } catch (submitError: unknown) {
      setError(leaveErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const counts = useMemo(
    () =>
      requests.reduce(
        (result, request) => {
          result[request.status] = (result[request.status] || 0) + 1;
          return result;
        },
        { pending: 0, approved: 0, rejected: 0 } as Record<string, number>,
      ),
    [requests],
  );
  const cancelPending = async (id: string) => {
    setCancelling(id);
    setError('');
    setNotice('');
    try {
      await employeeRepository.cancelLeave(id, 'cancelled');
      setNotice('Pending leave request cancelled.');
      await load();
    } catch (cancelError: unknown) {
      setError(leaveErrorMessage(cancelError));
    } finally {
      setCancelling(null);
    }
  };
  const upcoming = requests.find(
    (request) => request.status === 'approved' && request.starts_on >= today,
  );
  const linkedRequestMissing = requestId && requests.length > 0 && !requests.some(request => request.id === requestId);

  if (loading) {
    return (
      <section className="mx-auto max-w-[1220px]">
        <h1 className="text-2xl font-bold">Leave</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white"
              key={index}
            />
          ))}
        </div>
      </section>
    );
  }

  if (error && !profile) {
    return (
      <section className="mx-auto max-w-[1220px]">
        <h1 className="text-2xl font-bold">Leave</h1>
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <p>{error}</p>
          <button className="btn btn-primary mt-3" onClick={load}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1220px] space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Leave</h1>
        <p className="mt-1 text-sm text-slate-600">
          Request time away and track your leave status.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Pending', counts.pending, 'text-amber-700'],
          ['Approved', counts.approved, 'text-emerald-700'],
          ['Rejected', counts.rejected, 'text-rose-700'],
          ['Total requests', requests.length, 'text-slate-800'],
        ].map(([label, count, color]) => (
          <div className="card flex items-center justify-between p-3" key={String(label)}>
            <span className="text-sm text-slate-600">{label}</span>
            <b className={`text-xl ${color}`}>{count}</b>
          </div>
        ))}
      </div>

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {linkedRequestMissing && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This request is no longer available.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,.82fr)_minmax(0,1fr)]">
        <form onSubmit={submit} className="card space-y-4 p-4 md:p-5">
          <div>
            <h2 className="font-bold">New leave request</h2>
            <p className="mt-1 text-sm text-slate-500">
              We will send it to your manager for review.
            </p>
          </div>
          <label className="block text-sm font-medium">
            Leave type
            <select
              aria-label="Leave type"
              required
              value={form.leave_type_id}
              onChange={(event) =>
                setForm({ ...form, leave_type_id: event.target.value })
              }
              className="input mt-1 h-10 py-2"
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Start date
              <input
                required
                min={today}
                type="date"
                value={form.starts_on}
                onChange={(event) =>
                  setForm({ ...form, starts_on: event.target.value })
                }
                className="input mt-1 h-10 py-2"
              />
            </label>
            <label className="text-sm font-medium">
              End date
              <input
                required
                min={form.starts_on || today}
                type="date"
                value={form.ends_on}
                onChange={(event) =>
                  setForm({ ...form, ends_on: event.target.value })
                }
                className="input mt-1 h-10 py-2"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Reason
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
              className="input mt-1 min-h-24 resize-y"
              placeholder="Briefly describe why you need leave."
            />
            <span className="mt-1 block text-right text-xs text-slate-500">
              {form.reason.length}/500
            </span>
          </label>
          <div className="flex justify-end border-t border-slate-100 pt-3">
            <button
              disabled={submitting || !types.length}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit request'}
            </button>
          </div>
        </form>

        <div className="card overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-5">
            <div>
              <h2 className="font-bold">Recent leave requests</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your latest requests and manager decisions.
              </p>
            </div>
            {upcoming && (
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                Upcoming: {formatDate(upcoming.starts_on)}
              </span>
            )}
          </div>
          {requests.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-teal-50 text-lg text-teal-700">
                +
              </div>
              <b className="block">No leave requests yet</b>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
                Your submitted leave requests will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((request) => (
                <article className={`p-4 md:px-5 ${request.id === requestId ? 'bg-amber-50 ring-2 ring-inset ring-amber-300' : ''}`} id={`leave-request-${request.id}`} key={request.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <b>{request.leave_types?.name || request.leave_type || 'Leave request'}</b>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDate(request.starts_on)} - {formatDate(request.ends_on)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[request.status] || 'bg-slate-100 text-slate-700'}`}
                    >
                      {request.status[0].toUpperCase() + request.status.slice(1)}
                    </span>
                  </div>
                  {request.approval_comment && (
                    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <b>Admin comment:</b> {request.approval_comment}
                    </p>
                  )}
                  {(request.leave_approval_events || []).map((event: any, index: number) => (
                    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" key={`${event.event_type}-${event.created_at || index}`}>
                      <b>{event.event_type === 'approved' ? 'Approved' : event.event_type === 'rejected' ? 'Rejected' : 'Leave update'}:</b> {event.comment || 'No comment provided.'}
                    </p>
                  ))}
                  {request.status === 'pending' && (
                    <button
                      type="button"
                      className="btn mt-3 border px-3 py-1.5 text-sm text-rose-700"
                      disabled={cancelling === request.id}
                      onClick={() => void cancelPending(request.id)}
                    >
                      {cancelling === request.id ? 'Cancelling...' : 'Cancel request'}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
