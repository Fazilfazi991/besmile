export type KpiChartDatum = { label: string; value: number; color: string };
export type KpiChartModel =
  | { type: 'donut'; label: string; data: KpiChartDatum[] }
  | { type: 'segments'; label: string; data: KpiChartDatum[] }
  | { type: 'bars'; label: string; data: KpiChartDatum[] }
  | { type: 'sparkline'; label: string; data: KpiChartDatum[] };

const clean = (value: unknown) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);

export function ratioChart(label: string, numerator: number, denominator: number, numeratorLabel: string, remainderLabel: string, colors = ['#14988c', '#dfe8ea']): KpiChartModel {
  const total = clean(denominator);
  const part = Math.min(clean(numerator), total);
  return { type: 'donut', label, data: [{ label: numeratorLabel, value: part, color: colors[0] }, { label: remainderLabel, value: Math.max(0, total - part), color: colors[1] }] };
}

export function distributionChart(type: 'segments' | 'bars', label: string, data: KpiChartDatum[]): KpiChartModel {
  return { type, label, data: data.map(item => ({ ...item, value: clean(item.value) })) };
}

export function trendChart(label: string, data: KpiChartDatum[]): KpiChartModel {
  return { type: 'sparkline', label, data: data.map(item => ({ ...item, value: clean(item.value) })) };
}

export function chartTotal(model: KpiChartModel) {
  return model.data.reduce((sum, item) => sum + clean(item.value), 0);
}

export function chartAriaLabel(model: KpiChartModel) {
  const values = model.data.map(item => `${item.label}: ${item.value.toLocaleString('en-IN')}`).join('; ');
  return `${model.label}. ${values || 'No comparison data'}`;
}

export function businessMonthKeys(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return { current: `${year}-${String(month).padStart(2, '0')}`, previous: `${previousYear}-${String(previousMonth).padStart(2, '0')}` };
}

export function operationalKpiCharts(input: {
  employees: number; presentToday: number; onLeave: number; leads: number; newLeads: number;
  monthlyIncome: number; previousIncome: number; pendingLeave: number; openTasks: number; overdueTasks: number;
  outstandingInvoices: number; totalInvoices: number; salariesPending: number; salariesTotal: number;
}) {
  const notClockedIn = Math.max(0, clean(input.employees) - clean(input.presentToday) - clean(input.onLeave));
  return {
    employees: distributionChart('segments', 'Today’s workforce status', [
      { label: 'Present', value: input.presentToday, color: '#14988c' },
      { label: 'On leave', value: input.onLeave, color: '#4f86d9' },
      { label: 'Not clocked in', value: notClockedIn, color: '#dfe8ea' },
    ]),
    attendance: ratioChart('Attendance rate today', input.presentToday, input.employees, 'Present', 'Not present'),
    leads: ratioChart('New share of active leads today', input.newLeads, input.leads, 'New today', 'Existing', ['#e7773d', '#f2ded3']),
    revenue: distributionChart('bars', 'Current and previous month revenue', [
      { label: 'Previous', value: input.previousIncome, color: '#9cb9b5' },
      { label: 'Current', value: input.monthlyIncome, color: '#14988c' },
    ]),
    leave: distributionChart('bars', 'Leave workload today', [
      { label: 'Pending', value: input.pendingLeave, color: '#df5d8e' },
      { label: 'On leave', value: input.onLeave, color: '#86a9df' },
    ]),
    tasks: ratioChart('Open task health', input.overdueTasks, input.openTasks, 'Overdue', 'On schedule', ['#df6262', '#6f73cf']),
    invoices: ratioChart('Invoice settlement status', input.outstandingInvoices, input.totalInvoices, 'Outstanding', 'Settled', ['#dc7a3a', '#83bcae']),
    payroll: ratioChart('Payroll amount status', input.salariesPending, input.salariesTotal, 'Pending', 'Paid', ['#d78338', '#70b49f']),
  };
}

export function executiveKpiCharts(metrics: {
  trend: Array<{ label: string; revenue: number; collections: number }>;
  activeLeadDistribution: KpiChartDatum[];
  periodConvertedCount: number;
  periodLeadCount: number;
  overdueOutstanding: number;
  outstanding: number;
}) {
  return {
    revenue: trendChart('Revenue over the last six months', metrics.trend.map(row => ({ label: row.label, value: row.revenue, color: '#14988c' }))),
    collections: trendChart('Invoice collections over the last six months', metrics.trend.map(row => ({ label: row.label, value: row.collections, color: '#4f86d9' }))),
    leads: distributionChart('segments', 'Active leads by pipeline stage', metrics.activeLeadDistribution),
    conversion: ratioChart('Lead conversion in the selected period', metrics.periodConvertedCount, metrics.periodLeadCount, 'Converted', 'Not converted', ['#7d62cf', '#e5e0f4']),
    invoices: ratioChart('Outstanding balance by due status', metrics.overdueOutstanding, metrics.outstanding, 'Overdue', 'Not overdue', ['#dc645d', '#e8ad78']),
  };
}
