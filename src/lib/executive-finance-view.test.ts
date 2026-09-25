import { describe, expect, it } from 'vitest';
import { buildExecutiveFinanceView, buildExecutiveFinanceViewForRange } from './executive-finance-view';
import { crmDashboardPeriodRange } from './crm-dashboard-e1';

describe('executive finance overview', () => {
  it('uses the same transaction types and period as the existing Finance totals', () => {
    const view = buildExecutiveFinanceView([
      { transaction_type: 'income', transaction_date: '2026-09-03', amount: 1000 },
      { transaction_type: 'invoice_payment', transaction_date: '2026-09-12', amount: 500 },
      { transaction_type: 'expense', transaction_date: '2026-09-14', amount: 300, expense_category: { name: 'Capital' } },
      { transaction_type: 'payroll_payment', transaction_date: '2026-09-19', amount: 200 },
      { transaction_type: 'expense', transaction_date: '2026-08-20', amount: 900 },
    ], 'month', 'Asia/Kolkata', new Date('2026-09-25T12:00:00Z'));
    expect(view.income).toBe(1500);
    expect(view.expenses).toBe(500);
    expect(view.net).toBe(1000);
    expect(view.margin).toBeCloseTo(66.6667, 3);
    expect(view.breakdown.map(row => [row.name, row.value])).toEqual([
      ['Capital', 300], ['Monthly Expenses', 200], ['Marketing', 0],
      ['Admin & Utilities', 0], ['Psychologist Session Payout', 0], ['Other', 0],
    ]);
    expect(view.netTrend.at(-1)?.net).toBe(view.net);
    expect(view.trend.reduce((sum, row) => sum + row.income, 0)).toBe(view.income);
  });

  it('keeps an empty period honest', () => {
    const view = buildExecutiveFinanceView([], 'month', 'Asia/Kolkata', new Date('2026-09-25T12:00:00Z'));
    expect(view.margin).toBeNull();
    expect(view.breakdown).toEqual([]);
  });

  it('keeps expense categories in the prescribed chart and legend order regardless of amount', () => {
    const names = ['Other', 'Psychologist session payout', 'Admin & Utilities', 'Marketing', 'Monthly Expenses', 'Capital'];
    const view = buildExecutiveFinanceView(names.map((name, index) => ({
      transaction_type: 'expense', transaction_date: '2026-09-14', amount: (index + 1) * 100,
      expense_category: { name },
    })), 'month', 'Asia/Kolkata', new Date('2026-09-25T12:00:00Z'));
    expect(view.breakdown.map(row => row.name)).toEqual(['Capital', 'Monthly Expenses', 'Marketing', 'Admin & Utilities', 'Psychologist Session Payout', 'Other']);
    expect(view.breakdown.reduce((total, row) => total + row.value, 0)).toBe(view.expenses);
  });

  it('shows all active categories before historical categories without changing their amounts', () => {
    const view = buildExecutiveFinanceViewForRange([
      { transaction_type: 'expense', transaction_date: '2026-09-20', amount: 15, expense_category: { name: 'Maintenance' } },
      { transaction_type: 'expense', transaction_date: '2026-09-20', amount: 50, expense_category: { name: 'Monthly Expenses' } },
    ], { start: '2026-09-01', end: '2026-09-25' });
    expect(view.breakdown.map(row => [row.name, row.value])).toEqual([
      ['Capital', 0], ['Monthly Expenses', 50], ['Marketing', 0],
      ['Admin & Utilities', 0], ['Psychologist Session Payout', 0], ['Other', 0],
      ['Maintenance', 15],
    ]);
    expect(view.breakdown.reduce((total, row) => total + row.value, 0)).toBe(view.expenses);
  });

  it.each(['today', 'week', 'month'] as const)('uses the exact top dashboard %s range for Finance', period => {
    const range = crmDashboardPeriodRange(period, '2026-09-25');
    const view = buildExecutiveFinanceViewForRange([
      { transaction_type: 'income', transaction_date: range.start, amount: 100 },
      { transaction_type: 'expense', transaction_date: range.end, amount: 20, expense_category: { name: 'Marketing' } },
      { transaction_type: 'income', transaction_date: '2026-01-01', amount: 900 },
    ], range);
    expect(view.range).toEqual(range);
    expect(view.income).toBe(100);
    expect(view.expenses).toBe(20);
  });

  it('uses inclusive exact Custom start and end dates from the top selector', () => {
    const range = { start: '2026-09-12', end: '2026-09-14' };
    const view = buildExecutiveFinanceViewForRange([
      { transaction_type: 'income', transaction_date: '2026-09-11', amount: 900 },
      { transaction_type: 'income', transaction_date: '2026-09-12', amount: 100 },
      { transaction_type: 'expense', transaction_date: '2026-09-14', amount: 30 },
      { transaction_type: 'expense', transaction_date: '2026-09-15', amount: 900 },
    ], range);
    expect(view.range).toEqual(range);
    expect(view.income).toBe(100);
    expect(view.expenses).toBe(30);
  });
});
