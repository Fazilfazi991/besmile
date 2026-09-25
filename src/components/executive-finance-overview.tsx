'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartNoAxesCombined, Coins, FileChartColumn, Lightbulb, LockKeyhole, Percent, Wallet } from 'lucide-react';
import { chartInr } from '@/lib/finance-format';
import { buildExecutiveFinanceViewForRange } from '@/lib/executive-finance-view';
import styles from './executive-finance-overview.module.css';

const colors = ['#287de1', '#1fa05f', '#ffb547', '#6552c6', '#1ca9ba', '#de6689', '#e68c2e'];
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
const compactNumber = (value: number) => {
  const absolute = Math.abs(value);
  let scale = 1;
  let suffix = '';
  if (absolute >= 10_000_000) { scale = 10_000_000; suffix = 'Cr'; }
  else if (absolute >= 100_000) { scale = 100_000; suffix = 'L'; }
  else if (absolute >= 1_000) { scale = 1_000; suffix = 'K'; }
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: scale === 1 ? 0 : 1 }).format(value / scale)}${suffix}`;
};
const compactInr = (value: number) => `INR ${compactNumber(value)}`;
const axisMoney = compactNumber;
const percentLabel = (value: number) => `${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;

type Props = { transactions: any[]; range: { start: string; end: string } };

export function ExecutiveFinanceOverview({ transactions, range }: Props) {
  const view = useMemo(() => buildExecutiveFinanceViewForRange(transactions, range), [transactions, range]);
  const hasActivity = view.income !== 0 || view.expenses !== 0;
  const leadingExpense = view.breakdown.find(row => row.value > 0);
  const insight = [
    !hasActivity ? 'No finance activity was recorded in this period.' : view.net < 0 ? `Expenses exceeded income by ${compactInr(Math.abs(view.net))} this period.` : view.net > 0 ? `Income exceeded expenses by ${compactInr(view.net)} this period.` : 'Income and expenses were balanced this period.',
    leadingExpense ? `${leadingExpense.name} accounts for ${leadingExpense.percent.toFixed(0)}% of expenses.` : 'No expenses were recorded in this period.',
    hasActivity ? `Net result is ${compactInr(view.net)}. ${view.margin === null ? 'Margin is unavailable until income is recorded.' : `Net margin is ${percentLabel(view.margin)}.`}` : 'Figures and trends will appear when transactions are recorded.',
  ];

  return <section className={styles.overview} aria-labelledby="executive-finance-title">
    <header className={styles.heading}>
      <div className={styles.headingTitle}><span className={styles.mark}><ChartNoAxesCombined size={26} aria-hidden="true" /></span><div><h2 id="executive-finance-title">Finance Overview</h2><p>{dateLabel(view.range.start)} – {dateLabel(view.range.end)} <span>· Inclusive</span></p></div></div>
      <div className={styles.actions}><Link className={styles.openFinance} href="/admin/finance"><LockKeyhole size={17} aria-hidden="true" />Open Finance</Link></div>
    </header>

    <div className={styles.stats}>
      <Stat tone="income" icon={<Wallet />} label="Total Income" value={compactInr(view.income)} note="Recorded income" />
      <Stat tone="expenses" icon={<Coins />} label="Total Expenses" value={compactInr(view.expenses)} note="Recorded expenses" />
      <Stat tone="result" icon={<FileChartColumn />} label="Net Result" value={compactInr(view.net)} note="Income less expenses" />
      <Stat tone="margin" icon={<Percent />} label="Margin" value={view.margin === null ? '—' : percentLabel(view.margin)} note={view.margin === null ? 'No income in this period' : 'Net result margin'} />
    </div>

    <div className={styles.grid}>
      <section className={`${styles.panel} ${styles.incomePanel}`} aria-labelledby="income-expenses-title"><div className={styles.panelHeading}><h3 id="income-expenses-title">Income vs Expenses</h3><div className={styles.chartLegend}><span><i />Income</span><span><i />Expenses</span></div></div>{hasActivity ? <div className={styles.chart} role="img" aria-label={view.trend.map(row => `${row.label}: income ${chartInr(row.income)}, expenses ${chartInr(row.expenses)}`).join('; ')}><ResponsiveContainer width="100%" height="100%"><BarChart data={view.trend} margin={{ top: 10, right: 4, bottom: 0, left: -12 }}><CartesianGrid stroke="#ebeff3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#62728a', fontSize: 11 }} /><YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} tick={{ fill: '#62728a', fontSize: 11 }} /><Tooltip formatter={(value) => chartInr(Number(value))} /><Bar dataKey="income" name="Income" fill="#168d72" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} /><Bar dataKey="expenses" name="Expenses" fill="#e23e5a" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} /></BarChart></ResponsiveContainer></div> : <Empty />}</section>
      <section className={`${styles.panel} ${styles.breakdownPanel}`} aria-labelledby="expense-breakdown-title"><h3 id="expense-breakdown-title">Expense Breakdown</h3>{view.breakdown.length ? <div className={styles.breakdown}><div className={styles.donut} role="img" aria-label={view.breakdown.map(row => `${row.name}: ${chartInr(row.value)}, ${row.percent.toFixed(0)} percent`).join('; ')}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={view.breakdown} dataKey="value" nameKey="name" innerRadius="61%" outerRadius="88%" startAngle={90} endAngle={-270} paddingAngle={1} stroke="none" isAnimationActive={false}>{view.breakdown.map((row, index) => <Cell key={row.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => chartInr(Number(value))} /></PieChart></ResponsiveContainer><div className={styles.donutCenter}><small>Total Expenses</small><strong>{compactInr(view.expenses)}</strong></div></div><div className={styles.breakdownList}>{view.breakdown.map((row, index) => <div className={styles.breakdownRow} key={row.name}><i style={{ background: colors[index % colors.length] }} /><span>{row.name}</span><small>{compactInr(row.value)} · {row.percent.toFixed(0)}%</small></div>)}</div></div> : <Empty text="No expense activity in this period" />}</section>
      <section className={`${styles.panel} ${styles.netPanel}`} aria-labelledby="net-trend-title"><h3 id="net-trend-title">Net Result Trend</h3><p className={styles.chartSubhead}>Cumulative net result for the selected period</p>{hasActivity ? <div className={styles.chart} role="img" aria-label={view.netTrend.map(row => `${row.label}: ${chartInr(row.net)} cumulative net result`).join('; ')}><ResponsiveContainer width="100%" height="100%"><AreaChart data={view.netTrend} margin={{ top: 14, right: 10, bottom: 0, left: -10 }}><defs><linearGradient id="executiveNetFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e23e5a" stopOpacity={0.17} /><stop offset="100%" stopColor="#e23e5a" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#ebeff3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#62728a', fontSize: 11 }} /><YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} tick={{ fill: '#62728a', fontSize: 11 }} /><Tooltip formatter={(value) => chartInr(Number(value))} /><Area type="monotone" dataKey="net" name="Net result" stroke="#e23e5a" strokeWidth={2.5} fill="url(#executiveNetFill)" dot={{ r: 3, fill: '#e23e5a' }} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <Empty />}</section>
      <section className={`${styles.panel} ${styles.insights}`} aria-labelledby="finance-insights-title"><h3 id="finance-insights-title"><Lightbulb size={20} aria-hidden="true" />Key Insights</h3><ul>{insight.map(item => <li key={item}>{item}</li>)}</ul></section>
    </div>
  </section>;
}

function Stat({ tone, icon, label, value, note }: { tone: string; icon: React.ReactNode; label: string; value: string; note: string }) { return <article className={`${styles.stat} ${styles[tone]}`}><div className={styles.statTop}><span className={styles.statIcon} aria-hidden="true">{icon}</span><span className={styles.statLabel}>{label}</span></div><strong title={value}>{value}</strong><small>{note}</small></article>; }
function Empty({ text = 'No finance activity in this period' }: { text?: string }) { return <p className={styles.empty}>{text}</p>; }
