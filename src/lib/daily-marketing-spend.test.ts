import { describe, expect, it } from 'vitest';
import { dailyMarketingPerformance, type MarketingTransaction } from './daily-marketing-spend';
import { crmDashboardPeriodRange, currentCrmBusinessDate } from './crm-dashboard-e1';

const expense = (date: string, amount: number, overrides: Partial<MarketingTransaction> = {}): MarketingTransaction => ({
  transaction_date: date, amount, transaction_type: 'expense', expense_category: { name: 'Marketing' }, ...overrides,
});
const leads = [{ date: '2026-10-19', leads: 2, converted: 0 }, { date: '2026-10-20', leads: 10, converted: 0 }];

describe('daily Marketing spend performance', () => {
  it('shows ₹400 / 10 leads = ₹40, aggregates legitimate entries and excludes archived/non-Marketing expenses', () => {
    const report = dailyMarketingPerformance([expense('2026-10-20', 300), expense('2026-10-20', 100),
      expense('2026-10-20', 999, { archived_at: '2026-10-20' }), expense('2026-10-20', 999, { expense_category: { name: 'Other' } })], leads, crmDashboardPeriodRange('today', '2026-10-20'));
    expect(report.daily).toEqual([{ date: '2026-10-20', spend: 400, leads: 10, cpl: 40 }]);
    expect(report.blendedCpl).toBe(40);
  });
  it('calculates week/month totals and blended CPL from totals instead of summing daily CPL', () => {
    const rows = [expense('2026-10-01', 600), expense('2026-10-19', 200), expense('2026-10-20', 400)];
    const week = dailyMarketingPerformance(rows, leads, crmDashboardPeriodRange('week', '2026-10-20'));
    expect([week.totalSpend, week.totalLeads, week.blendedCpl]).toEqual([600, 12, 50]);
    const month = dailyMarketingPerformance(rows, leads, crmDashboardPeriodRange('month', '2026-10-20'));
    expect([month.totalSpend, month.totalLeads, month.blendedCpl]).toEqual([1200, 12, 100]);
    expect(month.daily[0].cpl).toBeNull();
  });
  it('returns null CPL for zero leads and uses the India business date at midnight', () => {
    const report = dailyMarketingPerformance([expense('2026-10-20', 400)], [], crmDashboardPeriodRange('today', '2026-10-20'));
    expect(report.blendedCpl).toBeNull();
    expect(report.daily[0].cpl).toBeNull();
    expect(currentCrmBusinessDate(new Date('2026-10-19T18:30:00Z'))).toBe('2026-10-20');
  });
});
