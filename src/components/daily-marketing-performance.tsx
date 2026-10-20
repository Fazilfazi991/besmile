import { dailyMarketingPerformance, type MarketingTransaction } from '@/lib/daily-marketing-spend';
import { type CrmDailyPoint, type CrmDateRange } from '@/lib/crm-dashboard-e1';

const rupees = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);

export function DailyMarketingPerformance({ transactions, leads, range }: { transactions: MarketingTransaction[]; leads: CrmDailyPoint[]; range: CrmDateRange }) {
  const report = dailyMarketingPerformance(transactions, leads, range);
  return <section className="card min-w-0 p-4" aria-label="Daily lead marketing performance">
    <h2 className="font-bold">Daily spend &amp; leads</h2>
    <p className="mt-1 text-sm text-slate-600">{range.start} – {range.end} · Marketing expenses from Finance · India business dates</p>
    <dl className="my-4 grid gap-3 sm:grid-cols-3">
      <div><dt className="text-sm text-slate-600">Total spend</dt><dd className="font-bold">{rupees(report.totalSpend)}</dd></div>
      <div><dt className="text-sm text-slate-600">New leads</dt><dd className="font-bold">{report.totalLeads}</dd></div>
      <div><dt className="text-sm text-slate-600">Blended cost per lead</dt><dd className="font-bold">{report.blendedCpl === null ? '— / No leads' : rupees(report.blendedCpl)}</dd></div>
    </dl>
    <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date', 'Marketing spend', 'New leads', 'Cost per lead'].map(title => <th key={title} className="px-2 py-2">{title}</th>)}</tr></thead>
      <tbody>{[...report.daily].reverse().map(row => <tr className="border-t" key={row.date}><td className="whitespace-nowrap px-2 py-2">{row.date}</td><td className="px-2 py-2">{rupees(row.spend)}</td><td className="px-2 py-2">{row.leads}</td><td className="px-2 py-2">{row.cpl === null ? '—' : rupees(row.cpl)}</td></tr>)}</tbody>
    </table></div>
  </section>;
}
