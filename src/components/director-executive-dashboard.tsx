'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { adminRepository } from '@/lib/admin-repository';
import { inr } from '@/components/finance-ui';
import { ModuleIcon } from '@/components/module-icon';
import { businessDateParts, executivePeriodRange, invoiceBalance, isActiveLead, isInRange, percentageChange, type ExecutivePeriod } from '@/lib/executive-dashboard';

const PERIOD_LABELS: Record<ExecutivePeriod, string> = { month: 'This month', previous_month: 'Last month', quarter: 'Last 3 months', year: 'This year' };
const REVENUE_TYPES = new Set(['income', 'invoice_payment']);
const EXPENSE_TYPES = new Set(['expense', 'payroll_payment']);

export function DirectorExecutiveDashboard({ name }: { name?: string | null }) {
  const [period, setPeriod] = useState<ExecutivePeriod>('month');
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void adminRepository.directorExecutiveDashboard().then(result => {
      if (active) { setData(result); setError(''); }
    }).catch(caught => {
      if (active) setError(caught?.message || 'Executive data could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => data ? buildMetrics(data, period) : null, [data, period]);
  if (loading && !metrics) return <DirectorSkeleton />;
  if (!metrics) return <section className="director-dashboard"><div className="director-state" role="alert"><ModuleIcon label="Finance Dashboard" /><h1>Executive overview unavailable</h1><p>{error || 'Live dashboard data could not be loaded.'}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></div></section>;

  const firstName = String(name || 'Director').trim().split(/\s+/)[0];
  return <section className="director-dashboard">
    <header className="director-heading">
      <div><h1>Good {dayPart()}, {firstName}</h1><p>Here’s how BSmile is performing across the business.</p></div>
      <label className="director-period"><span>Reporting period</span><select value={period} onChange={event => setPeriod(event.target.value as ExecutivePeriod)}>{Object.entries(PERIOD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </header>
    {error && <p className="director-inline-error" role="status">Some data could not be refreshed. The figures below are from the latest successful load.</p>}

    <div className="director-kpis">
      <Kpi icon="Revenue" label="Revenue" value={inr(metrics.revenue)} change={metrics.revenueChange} href="/admin/finance" />
      <Kpi icon="Income" label="Collections" value={inr(metrics.collections)} change={metrics.collectionsChange} href="/admin/finance/income" />
      <Kpi icon="Leads" label="Active leads" value={String(metrics.activeLeads)} href="/admin/crm/leads" />
      <Kpi icon="Sales" label="Conversion rate" value={`${metrics.conversion.toFixed(1)}%`} change={metrics.conversionPointChange} changeUnit="pp" href="/admin/crm" />
      <Kpi icon="Invoices" label="Outstanding invoices" value={inr(metrics.outstanding)} detail={`${metrics.openInvoiceCount} open balance${metrics.openInvoiceCount === 1 ? '' : 's'}`} href="/admin/finance/invoices" warning />
    </div>

    <div className="director-layout">
      <Panel title="Revenue & sales trend" subtitle="Last 6 months" action={<Link href="/admin/finance/reports">View reports</Link>} className="director-trend-panel">
        <TrendChart rows={metrics.trend} />
      </Panel>
      <Panel title="Finance overview" subtitle={PERIOD_LABELS[period]} action={<Link href="/admin/finance">Open finance</Link>}>
        <div className="director-finance">
          <FinanceStat label="Income" value={metrics.revenue} tone="teal" />
          <FinanceStat label="Expenses" value={metrics.expenses} tone="rose" />
          <div className="director-profit"><span>Net result</span><strong>{inr(metrics.profit)}</strong><small>{metrics.margin === null ? 'No income in this period' : `${metrics.margin.toFixed(1)}% margin`}</small></div>
          <div className="director-finance-scale" aria-label={`Income ${inr(metrics.revenue)} and expenses ${inr(metrics.expenses)}`}><i style={{ width: `${metrics.incomeShare}%` }} /><b style={{ width: `${metrics.expenseShare}%` }} /></div>
        </div>
      </Panel>
      <Panel title="Leads pipeline" subtitle={PERIOD_LABELS[period]} action={<Link href="/admin/crm/leads">Open leads</Link>} className="director-pipeline-panel">
        <div className="director-pipeline">{metrics.pipeline.length ? metrics.pipeline.map((row: any, index: number) => <div className="director-pipeline-row" key={row.name}><span className={`director-pipeline-dot tone-${index % 6}`} /><b>{row.name}</b><div><i className={`tone-${index % 6}`} style={{ width: `${row.percent}%` }} /></div><strong>{row.count}</strong><small>{row.percent.toFixed(0)}%</small></div>) : <Empty text="No leads entered this period." />}</div>
      </Panel>
      <Panel title="High-priority items" subtitle="Executive attention" action={<Link href="/admin/tasks">View all</Link>}>
        <div className="director-priorities">{metrics.priorities.length ? metrics.priorities.map((item: any) => <Link href={item.href} className={`director-priority priority-${item.tone}`} key={item.label}><ModuleIcon label={item.icon} /><span><b>{item.label}</b><small>{item.detail}</small></span><em>{item.action}</em></Link>) : <Empty text="Nothing currently needs executive attention." />}</div>
      </Panel>
    </div>
  </section>;
}

function buildMetrics(data: any, period: ExecutivePeriod) {
  const range = executivePeriodRange(period, new Date(), data.timezone);
  const previous = executivePeriodRange('previous_month', new Date(), data.timezone);
  const transactions = data.finance?.monthly || [];
  const total = (types: Set<string>, target: { start: string; end: string }) => transactions.filter((row: any) => types.has(row.transaction_type) && isInRange(row.transaction_date, target)).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const revenue = total(REVENUE_TYPES, range);
  const collections = total(new Set(['invoice_payment']), range);
  const expenses = total(EXPENSE_TYPES, range);
  const previousRevenue = total(REVENUE_TYPES, previous);
  const previousCollections = total(new Set(['invoice_payment']), previous);
  const leads = data.leads || [];
  const periodLeads = leads.filter((lead: any) => isInRange(lead.lead_date || lead.created_at, range));
  const periodConverted = leads.filter((lead: any) => lead.converted_at && isInRange(lead.converted_at, range));
  const previousLeads = leads.filter((lead: any) => isInRange(lead.lead_date || lead.created_at, previous));
  const previousConverted = leads.filter((lead: any) => lead.converted_at && isInRange(lead.converted_at, previous));
  const conversion = periodLeads.length ? periodConverted.length / periodLeads.length * 100 : 0;
  const previousConversion = previousLeads.length ? previousConverted.length / previousLeads.length * 100 : null;
  const openInvoices = (data.invoices || []).map((invoice: any) => ({ ...invoice, balance: invoiceBalance(invoice) })).filter((invoice: any) => invoice.balance > 0 && !['paid', 'cancelled'].includes(invoice.status));
  const outstanding = openInvoices.reduce((sum: number, invoice: any) => sum + invoice.balance, 0);
  const pipelineMap = new Map<string, number>();
  periodLeads.forEach((lead: any) => { const name = lead.status?.name || 'Unassigned'; pipelineMap.set(name, (pipelineMap.get(name) || 0) + 1); });
  const pipeline = [...pipelineMap].map(([name, count]) => ({ name, count, percent: periodLeads.length ? count / periodLeads.length * 100 : 0 })).sort((a, b) => b.count - a.count);
  const today = businessDateParts(new Date(), data.timezone).key;
  const overdueInvoices = openInvoices.filter((invoice: any) => invoice.due_date && String(invoice.due_date).slice(0, 10) < today);
  const overdueBalance = overdueInvoices.reduce((sum: number, invoice: any) => sum + invoice.balance, 0);
  const priorities = [
    overdueInvoices.length && { icon: 'Invoices', label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`, detail: `${inr(overdueBalance)} outstanding`, href: '/admin/finance/invoices', action: 'Review', tone: 'danger' },
    Number(data.summary?.followupsDue) > 0 && { icon: 'Follow-ups', label: `${data.summary.followupsDue} lead follow-up${data.summary.followupsDue === 1 ? '' : 's'} due`, detail: 'CRM follow-up required today', href: '/admin/crm/follow-ups', action: 'Follow up', tone: 'warning' },
    Number(data.summary?.overdueTasks) > 0 && { icon: 'Overdue tasks', label: `${data.summary.overdueTasks} overdue task${data.summary.overdueTasks === 1 ? '' : 's'}`, detail: 'Past the assigned due date', href: '/admin/tasks', action: 'Review', tone: 'info' },
    Number(data.summary?.pendingLeave) > 0 && { icon: 'Leave approvals', label: `${data.summary.pendingLeave} leave request${data.summary.pendingLeave === 1 ? '' : 's'} pending`, detail: 'Awaiting management decision', href: '/admin/leaves', action: 'Decide', tone: 'neutral' },
  ].filter(Boolean).slice(0, 4);
  const trend = lastSixMonths(data.finance?.monthly || [], data.sales || [], data.timezone);
  const scale = Math.max(1, revenue, expenses);
  return { revenue, collections, expenses, profit: revenue - expenses, margin: revenue ? (revenue - expenses) / revenue * 100 : null, incomeShare: revenue / scale * 100, expenseShare: expenses / scale * 100, revenueChange: period === 'month' ? percentageChange(revenue, previousRevenue) : null, collectionsChange: period === 'month' ? percentageChange(collections, previousCollections) : null, activeLeads: leads.filter(isActiveLead).length, conversion, conversionPointChange: period === 'month' && previousConversion !== null ? conversion - previousConversion : null, outstanding, openInvoiceCount: openInvoices.length, pipeline, priorities, trend };
}

function lastSixMonths(transactions: any[], sales: any[], timeZone: string) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    const key = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(date).slice(0, 7);
    return { key, label: new Intl.DateTimeFormat('en', { month: 'short', timeZone }).format(date), revenue: transactions.filter(row => REVENUE_TYPES.has(row.transaction_type) && String(row.transaction_date).slice(0, 7) === key).reduce((sum, row) => sum + Number(row.amount || 0), 0), sales: sales.filter(row => String(row.closing_date).slice(0, 7) === key).length };
  });
}

function Kpi({ icon, label, value, change, changeUnit = '%', detail, href, warning = false }: any) { const positive = change !== null && change !== undefined && change >= 0; return <Link href={href} className={`director-kpi${warning ? ' is-warning' : ''}`}><ModuleIcon label={icon} /><span><small>{label}</small><strong>{value}</strong>{change !== null && change !== undefined ? <em className={positive ? 'is-up' : 'is-down'}>{positive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}{changeUnit} <i>vs last month</i></em> : <em>{detail || 'Live business data'}</em>}</span></Link>; }
function Panel({ title, subtitle, action, children, className = '' }: any) { return <section className={`director-panel ${className}`}><header><span><h2>{title}</h2><p>{subtitle}</p></span>{action}</header><div className="director-panel-body">{children}</div></section>; }
function FinanceStat({ label, value, tone }: any) { return <div className={`director-finance-stat finance-${tone}`}><span>{label}</span><strong>{inr(value)}</strong></div>; }
function Empty({ text }: { text: string }) { return <p className="director-empty">{text}</p>; }
function dayPart() { const hour = new Date().getHours(); return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'; }

function TrendChart({ rows }: { rows: any[] }) {
  const maxRevenue = Math.max(1, ...rows.map(row => row.revenue));
  const maxSales = Math.max(1, ...rows.map(row => row.sales));
  const points = rows.map((row, index) => `${10 + index * 18},${70 - row.sales / maxSales * 54}`).join(' ');
  return <div className="director-chart" role="img" aria-label={rows.map(row => `${row.label}: ${inr(row.revenue)} revenue and ${row.sales} sales`).join('; ')}><div className="director-chart-legend"><span><i /> Revenue</span><span><i /> Sales</span></div><svg viewBox="0 0 104 82" preserveAspectRatio="none" aria-hidden="true"><g className="director-grid-lines"><line x1="4" y1="16" x2="100" y2="16"/><line x1="4" y1="43" x2="100" y2="43"/><line x1="4" y1="70" x2="100" y2="70"/></g>{rows.map((row, index) => <rect key={row.key} x={6 + index * 18} y={70 - row.revenue / maxRevenue * 48} width="8" height={row.revenue / maxRevenue * 48} rx="1" />)}<polyline points={points} />{rows.map((row, index) => <circle key={row.key} cx={10 + index * 18} cy={70 - row.sales / maxSales * 54} r="1.8" />)}</svg><div className="director-chart-labels">{rows.map(row => <span key={row.key}>{row.label}</span>)}</div></div>;
}

function DirectorSkeleton() { return <section className="director-dashboard" aria-busy="true"><div className="director-heading"><div><div className="director-skeleton skeleton-title"/><div className="director-skeleton skeleton-copy"/></div></div><div className="director-kpis">{Array.from({ length: 5 }, (_, index) => <div className="director-skeleton skeleton-kpi" key={index}/>)}</div><div className="director-layout"><div className="director-skeleton skeleton-panel"/><div className="director-skeleton skeleton-panel"/><div className="director-skeleton skeleton-panel"/><div className="director-skeleton skeleton-panel"/></div></section>; }
