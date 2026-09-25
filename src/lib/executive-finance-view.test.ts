import { describe, expect, it } from 'vitest';
import { buildExecutiveFinanceView } from './executive-finance-view';

describe('executive finance overview', () => {
  it('uses the same transaction types and period as the existing Finance totals', () => {
    const view = buildExecutiveFinanceView([
      { transaction_type: 'income', transaction_date: '2026-09-03', amount: 1000 },
      { transaction_type: 'invoice_payment', transaction_date: '2026-09-12', amount: 500 },
      { transaction_type: 'expense', transaction_date: '2026-09-14', amount: 300, expense_category: { name: 'Operations' } },
      { transaction_type: 'payroll_payment', transaction_date: '2026-09-19', amount: 200 },
      { transaction_type: 'expense', transaction_date: '2026-08-20', amount: 900 },
    ], 'month', 'Asia/Kolkata', new Date('2026-09-25T12:00:00Z'));
    expect(view.income).toBe(1500);
    expect(view.expenses).toBe(500);
    expect(view.net).toBe(1000);
    expect(view.margin).toBeCloseTo(66.6667, 3);
    expect(view.breakdown.map(row => [row.name, row.value])).toEqual([['Operations', 300], ['Payroll', 200]]);
    expect(view.netTrend.at(-1)?.net).toBe(view.net);
    expect(view.trend.reduce((sum, row) => sum + row.income, 0)).toBe(view.income);
  });

  it('keeps an empty period honest', () => {
    const view = buildExecutiveFinanceView([], 'month', 'Asia/Kolkata', new Date('2026-09-25T12:00:00Z'));
    expect(view.margin).toBeNull();
    expect(view.breakdown).toEqual([]);
  });
});
