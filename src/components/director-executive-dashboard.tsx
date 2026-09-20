'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminRepository } from '@/lib/admin-repository';
import { chartInr, compactInr } from '@/lib/finance-format';
import { ModuleIcon } from '@/components/module-icon';
import { executiveFirstName, type ExecutivePeriod } from '@/lib/executive-dashboard';
import { executiveKpiCharts } from '@/lib/dashboard-kpi-model';
import { KpiMiniChart } from '@/components/kpi-mini-chart';
import { buildDirectorMetrics } from '@/lib/director-executive-metrics';

const PERIOD_LABELS: Record<ExecutivePeriod, string> = { month: 'This month', previous_month: 'Last month', quarter: 'Last 3 months', year: 'This year' };
export function DirectorExecutiveDashboard({ name }: { name?: string | null }) {
  const [period, setPeriod] = useState<ExecutivePeriod>('month');
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void adminRepository.directorExecutiveDashboard().then(result => { if (active) { setData(result); setError(''); } }).catch(caught => { if (active) setError(caught?.message || 'Executive data could not be loaded.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const metrics = useMemo(() => data ? buildDirectorMetrics(data, period) : null, [data, period]);
  if (loading && !metrics) return <DirectorSkeleton />;
  if (!metrics) return <section className="director-dashboard"><div className="director-state" role="alert"><ModuleIcon label="Finance Dashboard" /><h1>Executive overview unavailable</h1><p>{error || 'Live dashboard data could not be loaded.'}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></div></section>;
  const firstName = executiveFirstName(name);
  const charts = executiveKpiCharts(metrics);
  return <section className="director-dashboard">
    <header className="director-heading">
      <div><h1>Good {dayPart()}{firstName ? `, ${firstName}` : ''}</h1><p>Here’s how BSmile is performing across the business.</p></div>
      <label className="director-period"><span>Reporting period</span><select value={period} onChange={event => setPeriod(event.target.value as ExecutivePeriod)}>{Object.entries(PERIOD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </header>
    {error && <p className="director-inline-error" role="status">Some data could not be refreshed. The figures below are from the latest successful load.</p>}
    <div className="director-kpis">
      <Kpi icon="Revenue" label="Revenue" value={compactInr(metrics.revenue)} change={metrics.revenueChange} noActivity={!metrics.revenue} href="/admin/finance" chart={charts.revenue} />
      <Kpi icon="Income" label="Collections" value={compactInr(metrics.collections)} change={metrics.collectionsChange} noActivity={!metrics.collections} href="/admin/finance/income" chart={charts.collections} />
      <Kpi icon="Leads" label="Active leads" value={String(metrics.activeLeads)} href="/admin/crm/leads" chart={charts.leads} />
      <Kpi icon="Leads" label="Today's Leads" value={String(metrics.todayLeads)} detail="Canonical CRM date" href="/admin/crm" />
      <Kpi icon="Sales" label="Conversion rate" value={`${metrics.conversion.toFixed(1)}%`} change={metrics.conversionPointChange} changeUnit="pp" noActivity={!metrics.periodLeadCount} href="/admin/crm" chart={charts.conversion} />
      <Kpi icon="Invoices" label="Outstanding invoices" value={compactInr(metrics.outstanding)} detail={`${metrics.openInvoiceCount} open balance${metrics.openInvoiceCount === 1 ? '' : 's'}`} href="/admin/finance/invoices" warning chart={charts.invoices} />
    </div>
    <div className="director-layout">
      <Panel title="Revenue & sales trend" subtitle="Last 6 months" action={<Link href="/admin/finance/reports">View reports</Link>} className="director-trend-panel"><ExecutiveTrendChart rows={metrics.trend} /></Panel>
      <Panel title="Finance overview" subtitle={PERIOD_LABELS[period]} action={<Link href="/admin/finance">Open finance</Link>}><FinanceOverview metrics={metrics} /></Panel>
      <Panel title="Leads by current stage" subtitle={PERIOD_LABELS[period]} action={<Link href="/admin/crm/leads">Open leads</Link>} className="director-pipeline-panel"><LeadPipeline rows={metrics.pipeline} /></Panel>
      <Panel title="High-priority items" subtitle="Executive attention" action={<Link href="/admin/tasks">View all</Link>} className="director-priority-panel"><div className="director-priorities">{metrics.priorities.length ? metrics.priorities.map((item: any) => <Link href={item.href} className={`director-priority priority-${item.tone}`} key={item.label}><ModuleIcon label={item.icon} /><span><b>{item.label}</b><small>{item.detail}</small></span><em>{item.action}</em></Link>) : <Empty text="Nothing currently needs executive attention." />}</div></Panel>
    </div>
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
