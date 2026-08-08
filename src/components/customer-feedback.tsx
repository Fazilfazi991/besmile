'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmployeeBanner, EmployeeEmptyState, EmployeeLoading, EmployeeMetric, EmployeeMetricGrid, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';

type Item = { id: string; submittedAt?: string; customerName?: string; staffMember?: string; rating?: number; message?: string; sessionCount?: string; service?: string; fields: Record<string, string> };
type FeedbackData = { items: Item[]; configured: boolean; warning?: string; updatedAt: string };
const PAGE_SIZE = 20;

function dateValue(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function inCurrentMonth(value?: string) {
  const date = dateValue(value);
  const now = new Date();
  return !!date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function CustomerFeedbackPage() {
  const [data, setData] = useState<FeedbackData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [rating, setRating] = useState('');
  const [staffMember, setStaffMember] = useState('');
  const [service, setService] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Item>();

  const fetchFeedback = async () => {
    try {
      const response = await fetch('/api/customer-feedback', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body);
      setError('');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Customer feedback is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    await fetchFeedback();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFeedback();
  }, []);

  const items = useMemo(() => data?.items || [], [data?.items]);
  const staffOptions = useMemo(() => [...new Set(items.map((item) => item.staffMember).filter(Boolean))] as string[], [items]);
  const serviceOptions = useMemo(() => [...new Set(items.map((item) => item.service).filter(Boolean))] as string[], [items]);
  const shown = useMemo(() => items.filter((item) => {
    const text = [item.customerName, item.staffMember, item.service, item.message, ...Object.values(item.fields)].filter(Boolean).join(' ').toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!rating || String(item.rating) === rating) && (!staffMember || item.staffMember === staffMember) && (!service || item.service === service);
  }).sort((left, right) => (dateValue(right.submittedAt)?.valueOf() || 0) - (dateValue(left.submittedAt)?.valueOf() || 0)), [items, query, rating, staffMember, service]);
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageItems = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ratings = items.filter((item) => item.rating !== undefined);
  const average = ratings.length ? (ratings.reduce((total, item) => total + (item.rating || 0), 0) / ratings.length).toFixed(1) : null;

  if (loading) return <EmployeeLoading cards={4} />;

  return <section className="space-y-4">
    <EmployeePageHeader title="Customer Feedback" subtitle="Read-only responses from the approved Google Form response sheet." action={<button className="btn btn-primary" onClick={() => void load()}>Refresh</button>} />
    {error && <EmployeeBanner>{error}</EmployeeBanner>}
    {data?.warning && <EmployeeBanner tone="pending">{data.warning}</EmployeeBanner>}
    {!data?.configured ? <EmployeeEmptyState title="Google Sheets setup required" detail="Add server-only Google credentials and share the response sheet with the service account." /> : <>
      <EmployeeMetricGrid columns={4}>
        <EmployeeMetric label="Total feedback" value={items.length} />
        <EmployeeMetric label="This month" value={items.filter((item) => inCurrentMonth(item.submittedAt)).length} tone="info" />
        <EmployeeMetric label="Average rating" value={average || 'No ratings'} tone="success" />
        <EmployeeMetric label="Low ratings" value={ratings.filter((item) => (item.rating || 0) <= 2).length} tone="danger" />
      </EmployeeMetricGrid>
      <EmployeeSection title="Feedback responses" description={`Last updated ${new Date(data.updatedAt).toLocaleString()}`}>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="input"
            aria-label="Search feedback"
            placeholder="Search responses"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Rating filter"
            value={rating}
            onChange={(event) => {
              setRating(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          {staffOptions.length > 1 && <select className="input" aria-label="Staff member filter" value={staffMember} onChange={(event) => {
            setStaffMember(event.target.value);
            setPage(1);
          }}><option value="">All staff members</option>{staffOptions.map((value) => <option key={value}>{value}</option>)}</select>}
          {serviceOptions.length > 1 && <select className="input" aria-label="Service filter" value={service} onChange={(event) => {
            setService(event.target.value);
            setPage(1);
          }}><option value="">All services</option>{serviceOptions.map((value) => <option key={value}>{value}</option>)}</select>}
        </div>
        {pageItems.length ? <div className="divide-y divide-slate-100">{pageItems.map((item) => <button className="block w-full p-4 text-left hover:bg-slate-50" onClick={() => setDetail(item)} key={item.id}><div className="flex justify-between gap-3"><b>{item.customerName || 'Feedback response'}</b>{item.rating !== undefined && <EmployeeStatusBadge tone={item.rating <= 2 ? 'danger' : item.rating >= 4 ? 'success' : 'pending'}>{item.rating}/5</EmployeeStatusBadge>}</div><p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.message || item.staffMember || 'Open response details'}</p><small className="mt-2 block text-slate-500">{item.staffMember || 'No staff member'}{item.service ? ` · ${item.service}` : ''}{item.submittedAt ? ` · ${item.submittedAt}` : ''}</small></button>)}</div> : <EmployeeEmptyState title="No feedback found" detail="Adjust the filters or wait for a new Google Form response." />}
        {shown.length > PAGE_SIZE && <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm"><span>Page {page} of {totalPages}</span><div className="flex gap-2"><button className="btn border" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="btn border" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
      </EmployeeSection>
      {detail && <EmployeeSection title={detail.customerName || 'Feedback response'} description={detail.submittedAt || 'Google Form response'} action={<button className="btn border" onClick={() => setDetail(undefined)}>Close</button>}><dl className="grid gap-3 p-4 sm:grid-cols-2">{Object.entries(detail.fields).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{value}</dd></div>)}</dl></EmployeeSection>}
    </>}
  </section>;
}
