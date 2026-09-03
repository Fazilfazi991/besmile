'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Feedback = { submittedAt?: string; rating?: number };

function isCurrentMonth(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return !Number.isNaN(date.valueOf()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function CustomerFeedbackDashboardWidget() {
  const [items, setItems] = useState<Feedback[] | null>(null);

  useEffect(() => {
    const load = () => { void fetch('/api/customer-feedback', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => setItems(data?.configured ? data.items || [] : null))
      .catch(() => setItems(null)); };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(load, 2500);
    return () => globalThis.clearTimeout(id);
  }, []);

  const metrics = useMemo(() => {
    if (!items) return null;
    const ratings = items.filter((item) => item.rating !== undefined);
    return {
      total: items.length,
      average: ratings.length ? (ratings.reduce((sum, item) => sum + (item.rating || 0), 0) / ratings.length).toFixed(1) : 'No ratings',
      low: ratings.filter((item) => (item.rating || 0) <= 2).length,
      month: items.filter((item) => isCurrentMonth(item.submittedAt)).length,
    };
  }, [items]);

  if (!metrics) return null;
  return <section className="executive-card"><div className="executive-card-heading"><div><h2>Customer feedback</h2><p>Google Form response summary</p></div><Link href="/admin/customer-feedback">Open feedback</Link></div><div className="crm-snapshot"><Snapshot label="Total responses" value={metrics.total} detail="All available" /><Snapshot label="Average rating" value={metrics.average} detail="Out of 5" /><Snapshot label="Low ratings" value={metrics.low} detail="Rating 2 or lower" /><Snapshot label="This month" value={metrics.month} detail="New responses" /></div></section>;
}

function Snapshot({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div><small>{label}</small><b>{value}</b><span>{detail}</span></div>;
}
