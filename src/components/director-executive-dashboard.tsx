'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminRepository } from '@/lib/admin-repository';
import { chartInr, compactInr } from '@/lib/finance-format';
import { ModuleIcon } from '@/components/module-icon';
import { executiveFirstName, type ExecutivePeriod } from '@/lib/executive-dashboard';
import { executiveKpiCharts } from '@/lib/dashboard-kpi-model';
import { KpiMiniChart } from '@/components/kpi-mini-chart';
import { buildDirectorMetrics } from '@/lib/director-executive-metrics';
import { ExecutiveFinanceOverview } from '@/components/executive-finance-overview';
import { clientSafeError } from '@/lib/client-error';
import {
  type CrmDashboardPeriod,
  type CrmDashboardSummary,
  type CrmDateRange,
  currentCrmBusinessDate,
  crmDashboardPeriodRange,
  formatCrmConversionRate,
  formatCrmRangeLabel,
  normalizeCrmDashboardSummary,
  sameCrmDateRange,
  validateCustomCrmRange,
} from '@/lib/crm-dashboard-e1';

const PERIOD_LABELS: Record<CrmDashboardPeriod, string> = { today: 'Today', week: 'This Week', month: 'This Month', custom: 'Custom' };
export function DirectorExecutiveDashboard({ name }: { name?: string | null }) {
  const [financePeriod, setFinancePeriod] = useState<ExecutivePeriod>('month');
  const [today, setToday] = useState(currentCrmBusinessDate);
  const [period, setPeriod] = useState<CrmDashboardPeriod>('month');
  const [range, setRange] = useState<CrmDateRange>(() => crmDashboardPeriodRange('month', currentCrmBusinessDate()));
  const [crmSummary, setCrmSummary] = useState<CrmDashboardSummary | null>(null);
  const [crmLoading, setCrmLoading] = useState(true);
  const [crmError, setCrmError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<CrmDateRange>(range);
  const [draftError, setDraftError] = useState('');
  const customTrigger = useRef<HTMLButtonElement>(null);
  const customDialog = useRef<HTMLDivElement>(null);
  const customStart = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void adminRepository.directorExecutiveDashboard().then(result => { if (active) { setData(result); setError(''); } }).catch(caught => { if (active) setError(caught?.message || 'Executive data could not be loaded.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const requestRange = { start: range.start, end: range.end };
    void adminRepository.crmDashboardSummary(requestRange.start, requestRange.end)
      .then(value => normalizeCrmDashboardSummary(value, requestRange))
      .then(value => { if (active) { setCrmSummary(value); setCrmError(''); } })
      .catch(caught => { if (active) setCrmError(clientSafeError(caught, 'CRM metrics could not be loaded. Refresh and try again.', { route: '/admin', action: 'load-executive-crm-summary' })); })
      .finally(() => { if (active) setCrmLoading(false); });
    return () => { active = false; };
  }, [range.end, range.start]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextToday = currentCrmBusinessDate();
      setToday(current => {
        if (current === nextToday) return current;
        if (period !== 'custom') { setCrmSummary(null); setCrmLoading(true); setRange(crmDashboardPeriodRange(period, nextToday)); }
        return nextToday;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [period]);
  const closeCustom = useCallback(() => {
    setCustomOpen(false);
    setDraftError('');
    window.requestAnimationFrame(() => customTrigger.current?.focus());
  }, []);
  useEffect(() => {
    if (!customOpen) return;
    window.requestAnimationFrame(() => customStart.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeCustom(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(customDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeCustom, customOpen]);
  const metrics = useMemo(() => data && crmSummary ? buildDirectorMetrics(data, range, crmSummary) : null, [crmSummary, data, range]);
  const rangeLabel = useMemo(() => formatCrmRangeLabel(range), [range]);
  function choosePreset(nextPeriod: Exclude<CrmDashboardPeriod, 'custom'>) {
    const nextRange = crmDashboardPeriodRange(nextPeriod, today);
    setPeriod(nextPeriod);
    if (!sameCrmDateRange(range, nextRange)) { setCrmSummary(null); setCrmLoading(true); setRange(nextRange); }
  }
  function openCustom() { setDraftRange(range); setDraftError(''); setCustomOpen(true); }
  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateCustomCrmRange(draftRange, today);
    if (validation) { setDraftError(validation); return; }
    setPeriod('custom');
    if (!sameCrmDateRange(range, draftRange)) { setCrmSummary(null); setCrmLoading(true); setRange(draftRange); }
    closeCustom();
  }
  if (loading && !metrics) return <DirectorSkeleton />;
  if (!crmSummary || !metrics) return crmLoading ? <DirectorSkeleton /> : <section className="director-dashboard"><div className="director-state" role="alert"><ModuleIcon label="Finance Dashboard" /><h1>Executive overview unavailable</h1><p>{crmError || error || 'Live dashboard data could not be loaded.'}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></div></section>;
  const firstName = executiveFirstName(name);
  const charts = executiveKpiCharts(metrics);
  return <section className="director-dashboard">
    <ExecutiveFinanceOverview transactions={data.finance?.monthly || []} timeZone={data.timezone} period={financePeriod} onPeriodChange={setFinancePeriod} />
    <header className="director-heading">
      <div><h1>Good {dayPart()}{firstName ? `, ${firstName}` : ''}</h1><p>Here’s how BSmile is performing across the business.</p></div>
      <div className="director-period"><span>Reporting period</span><div className="director-period-options" aria-label="Main dashboard reporting period">{(['today', 'week', 'month'] as const).map(item => <button type="button" key={item} onClick={() => choosePreset(item)} aria-pressed={period === item}>{PERIOD_LABELS[item]}</button>)}<button ref={customTrigger} type="button" onClick={openCustom} aria-pressed={period === 'custom'} aria-haspopup="dialog">Custom</button></div><small data-testid="director-selected-range">{PERIOD_LABELS[period]} · {rangeLabel}</small></div>
    </header>
    {(error || crmError) && <p className="director-inline-error" role="status">Some data could not be refreshed. The figures below are from the latest successful load.</p>}
    <div className="director-kpis">
      <Kpi icon="Revenue" label="Revenue" value={compactInr(metrics.revenue)} change={period === 'month' ? metrics.revenueChange : null} noActivity={!metrics.revenue} href="/admin/finance" chart={charts.revenue} />
      <Kpi icon="Income" label="Collections" value={compactInr(metrics.collections)} change={period === 'month' ? metrics.collectionsChange : null} noActivity={!metrics.collections} href="/admin/finance/income" chart={charts.collections} />
      <Kpi icon="Leads" label="Leads this period" value={String(metrics.periodLeadCount)} detail={rangeLabel} href="/admin/crm" />
      <Kpi icon="Leads" label="Today's Leads" value={String(metrics.todayLeads)} detail="Canonical CRM date" href="/admin/crm" />
      <Kpi icon="Sales" label="Conversion rate" value={formatCrmConversionRate(crmSummary)} detail={rangeLabel} noActivity={!metrics.periodLeadCount} href="/admin/crm" chart={charts.conversion} />
      <Kpi icon="Leads" label="Active Leads — All Time" value={String(metrics.activeLeads)} detail="Live pipeline · not period filtered" href="/admin/crm/leads" chart={charts.leads} />
      <Kpi icon="Invoices" label="Outstanding invoices" value={compactInr(metrics.outstanding)} detail={`${metrics.openInvoiceCount} open balance${metrics.openInvoiceCount === 1 ? '' : 's'}`} href="/admin/finance/invoices" warning chart={charts.invoices} />
    </div>
    <div className="director-layout">
      <Panel title="Revenue & sales trend" subtitle="Last 6 months" action={<Link href="/admin/finance/reports">View reports</Link>} className="director-trend-panel"><ExecutiveTrendChart rows={metrics.trend} /></Panel>
      <Panel title="Finance overview" subtitle={rangeLabel} action={<Link href="/admin/finance">Open finance</Link>}><FinanceOverview metrics={metrics} /></Panel>
      <Panel title="Leads by current stage" subtitle={rangeLabel} action={<Link href="/admin/crm/leads">Open leads</Link>} className="director-pipeline-panel"><LeadPipeline rows={metrics.pipeline} /></Panel>
      <Panel title="High-priority items" subtitle="Executive attention" action={<Link href="/admin/tasks">View all</Link>} className="director-priority-panel"><div className="director-priorities">{metrics.priorities.length ? metrics.priorities.map((item: any) => <Link href={item.href} className={`director-priority priority-${item.tone}`} key={item.label}><ModuleIcon label={item.icon} /><span><b>{item.label}</b><small>{item.detail}</small></span><em>{item.action}</em></Link>) : <Empty text="Nothing currently needs executive attention." />}</div></Panel>
    </div>
    {customOpen && typeof document !== 'undefined' && createPortal(<div className="fixed inset-0 z-[120] grid place-items-end bg-slate-950/40 p-0 sm:place-items-center sm:p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeCustom(); }}><div ref={customDialog} className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="director-custom-range-title" aria-describedby="director-custom-range-description"><div className="flex items-start justify-between gap-4"><div><h2 id="director-custom-range-title" className="text-xl font-bold text-slate-950">Custom dashboard period</h2><p id="director-custom-range-description" className="mt-1 text-sm text-slate-600">Choose inclusive CRM business dates. Future dates are unavailable.</p></div><button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xl text-slate-600 hover:bg-slate-100" aria-label="Close custom date range" onClick={closeCustom}>×</button></div><form className="mt-5" onSubmit={applyCustom} noValidate><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Start date<input ref={customStart} className="input mt-1.5 min-h-11 w-full" type="date" max={today} value={draftRange.start} onChange={event => { setDraftRange(current => ({ ...current, start: event.target.value })); setDraftError(''); }} /></label><label className="text-sm font-semibold text-slate-700">End date<input className="input mt-1.5 min-h-11 w-full" type="date" max={today} value={draftRange.end} onChange={event => { setDraftRange(current => ({ ...current, end: event.target.value })); setDraftError(''); }} /></label></div><p className="mt-3 min-h-5 text-sm font-medium text-rose-700" role={draftError ? 'alert' : undefined}>{draftError}</p><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 border" onClick={closeCustom}>Cancel</button><button type="submit" className="btn btn-primary min-h-11">Apply date range</button></div></form></div></div>, document.body)}
  </section>;
}

function Kpi({ icon, label, value, change, changeUnit = '%', detail, href, warning = false, noActivity = false, chart }: any) { const positive = change !== null && change !== undefined && change >= 0; const showChange = !noActivity && change !== null && change !== undefined; return <Link href={href} className={`director-kpi${warning ? ' is-warning' : ''}`}><ModuleIcon label={icon} /><span><small>{label}</small><strong title={value}>{value}</strong>{showChange ? <em className={positive ? 'is-up' : 'is-down'}>{positive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}{changeUnit} <i>vs last month</i></em> : <em>{noActivity ? 'No activity this period' : detail || 'Live business data'}</em>}{chart && <KpiMiniChart model={chart} />}</span></Link>; }

function Panel({ title, subtitle, action, children, className = '' }: any) { return <section className={`director-panel ${className}`}><header><span><h2>{title}</h2><p>{subtitle}</p></span>{action}</header><div className="director-panel-body">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <p className="director-empty">{text}</p>; }
function dayPart() { const hour = new Date().getHours(); return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'; }
const shortNumber = (value: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const chartSummary = (rows: any[]) => rows.map(row => `${row.label}: ${chartInr(row.revenue)} revenue and ${row.sales} sales`).join('; ');

function ExecutiveTrendChart({ rows }: { rows: any[] }) {
  if (rows.every(row => !row.revenue && !row.sales)) return <div className="director-chart-empty"><ModuleIcon label="Reports" /><b>No revenue or sales recorded</b><span>The last six months will appear here as activity is recorded.</span></div>;
  return <div className="director-chart" role="img" aria-label={chartSummary(rows)}><p className="sr-only">{chartSummary(rows)}</p><ResponsiveContainer width="100%" height={228}><ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}><CartesianGrid stroke="#e8eeef" strokeDasharray="3 4" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#6f7c8f', fontSize: 11 }} /><YAxis yAxisId="money" tickFormatter={shortNumber} tickLine={false} axisLine={false} width={48} tick={{ fill: '#6f7c8f', fontSize: 10 }} /><YAxis yAxisId="sales" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fill: '#6f7c8f', fontSize: 10 }} /><Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(15, 118, 110, .05)' }} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#536179' }} /><Bar yAxisId="money" dataKey="revenue" name="Revenue" fill="#36ad9f" radius={[5, 5, 0, 0]} maxBarSize={40} /><Line yAxisId="sales" type="monotone" dataKey="sales" name="Sales" stroke="#4978d1" strokeWidth={2} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div>;
}
function TrendTooltip({ active, payload, label }: any) { if (!active || !payload?.length) return null; const values = Object.fromEntries(payload.map((item: any) => [item.dataKey, item.value])); return <div className="director-tooltip"><b>{label}</b><span>Revenue <strong>{chartInr(values.revenue)}</strong></span><span>Sales <strong>{Number(values.sales || 0).toLocaleString('en-IN')}</strong></span></div>; }

function FinanceOverview({ metrics }: any) {
  if (!metrics.revenue && !metrics.expenses) return <div className="director-finance-empty"><ModuleIcon label="Finance Dashboard" /><b>No finance activity in this period</b><span>Income, expenses and net result will appear when transactions are recorded.</span></div>;
  const rows = [{ name: 'Income', value: metrics.revenue, fill: '#28a899' }, { name: 'Expenses', value: metrics.expenses, fill: '#dc5c70' }];
  return <div className="director-finance"><div className="director-finance-chart" role="img" aria-label={`Income ${chartInr(metrics.revenue)}; expenses ${chartInr(metrics.expenses)}`}><ResponsiveContainer width="100%" height={112}><BarChart layout="vertical" data={rows} margin={{ top: 0, right: 12, bottom: 0, left: 0 }}><XAxis type="number" hide domain={[0, 'dataMax']} /><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={58} tick={{ fill: '#5d6b7d', fontSize: 11 }} /><Tooltip formatter={(value: any) => chartInr(Number(value))} cursor={{ fill: 'transparent' }} /><Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>{rows.map(row => <Cell key={row.name} fill={row.fill} />)}</Bar></BarChart></ResponsiveContainer></div><div className="director-profit"><span>Net result</span><strong>{compactInr(metrics.profit)}</strong><small>{metrics.margin === null ? 'No income in this period' : `${metrics.margin.toFixed(1)}% margin`}</small></div></div>;
}

function LeadPipeline({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="director-pipeline-empty"><span>No leads entered this period.</span><Link href="/admin/crm/leads">Open leads</Link></div>;
  return <div className="director-pipeline" role="img" aria-label={rows.map(row => `${row.name}: ${row.count}, ${row.percent.toFixed(0)} percent`).join('; ')}>{rows.map((row: any, index: number) => <div className="director-pipeline-row" key={row.name}><span className={`director-pipeline-dot tone-${index % 6}`} /><b>{row.name}</b><div><i className={`tone-${index % 6}`} style={{ width: `${row.percent}%` }} /></div><strong>{row.count}</strong><small>{row.percent.toFixed(0)}%</small></div>)}</div>;
}

function DirectorSkeleton() { return <section className="director-dashboard" aria-busy="true"><div className="director-heading"><div><div className="director-skeleton skeleton-title"/><div className="director-skeleton skeleton-copy"/></div></div><div className="director-kpis">{Array.from({ length: 6 }, (_, index) => <div className="director-skeleton skeleton-kpi" key={index}/>)}</div><div className="director-layout"><div className="director-skeleton skeleton-panel"/><div className="director-skeleton skeleton-panel"/><div className="director-skeleton skeleton-panel"/><div className="director-skeleton skeleton-panel"/></div></section>; }
