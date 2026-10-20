import { shiftCrmDateKey, type CrmDateRange, type CrmDailyPoint } from './crm-dashboard-e1';

export const marketingSubtypes = ['Digital Marketing Expenses', 'Performance Marketing Expenses', 'Other Marketing Expenses'] as const;
export type MarketingTransaction = { amount: number | string; transaction_date: string; transaction_type: string; expense_category?: { name: string } | null; archived_at?: string | null };

export function dailyMarketingPerformance(transactions: MarketingTransaction[], leads: CrmDailyPoint[], range: CrmDateRange) {
  const spend = new Map<string, number>();
  for (const row of transactions) {
    if (row.transaction_type !== 'expense' || row.expense_category?.name !== 'Marketing' || row.archived_at) continue;
    spend.set(row.transaction_date, (spend.get(row.transaction_date) || 0) + Number(row.amount));
  }
  const leadCounts = new Map(leads.map(row => [row.date, row.leads]));
  const daily = [];
  for (let date = range.start; date <= range.end; date = shiftCrmDateKey(date, 1)) {
    const amount = spend.get(date) || 0;
    const count = leadCounts.get(date) || 0;
    daily.push({ date, spend: amount, leads: count, cpl: count ? amount / count : null });
  }
  const totalSpend = daily.reduce((sum, row) => sum + row.spend, 0);
  const totalLeads = daily.reduce((sum, row) => sum + row.leads, 0);
  return { daily, totalSpend, totalLeads, blendedCpl: totalLeads ? totalSpend / totalLeads : null };
}
