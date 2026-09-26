import { describe, expect, it } from 'vitest';
import { crmFinanceDisplay, marketingExpenseTotal } from './crm-marketing-expenses';
import { crmDashboardPeriodRange } from './crm-dashboard-e1';

describe('CRM Marketing Expenses card', () => {
  it('includes only active Marketing expense transactions on inclusive selected dates', () => {
    const row = (name: string, date: string, amount: number, transaction_type = 'expense', archived_at: string | null = null) => ({
      transaction_type, transaction_date: date, amount, expense_category: { name }, archived_at,
    });
    expect(marketingExpenseTotal([
      row('Marketing', '2026-09-12', 100), row('Marketing', '2026-09-14', 200),
      row('Monthly Expenses', '2026-09-13', 300), row('Maintenance', '2026-09-13', 400),
      row('Admin & Utilities', '2026-09-13', 500), row('Capital', '2026-09-13', 600), row('Other', '2026-09-13', 700),
      row('Psychologist session payout', '2026-09-13', 750),
      row('Marketing', '2026-09-11', 800), row('Marketing', '2026-09-15', 900),
      row('Marketing', '2026-09-13', 1000, 'income'), row('Marketing', '2026-09-13', 1100, 'expense', '2026-09-16T00:00:00Z'),
    ], { start: '2026-09-12', end: '2026-09-14' })).toBe(300);
  });

  it.each(['today', 'week', 'month'] as const)('follows the CRM %s date range', period => {
    const range = crmDashboardPeriodRange(period, '2026-09-25');
    expect(marketingExpenseTotal([
      { transaction_type: 'expense', transaction_date: range.start, amount: 10, expense_category: { name: 'Marketing' } },
      { transaction_type: 'expense', transaction_date: range.end, amount: 20, expense_category: { name: 'Marketing' } },
      { transaction_type: 'expense', transaction_date: '2026-01-01', amount: 30, expense_category: { name: 'Marketing' } },
    ], range)).toBe(30);
  });

  it('follows exact inclusive Custom dates', () => {
    expect(marketingExpenseTotal([
      { transaction_type: 'expense', transaction_date: '2026-09-11', amount: 50, expense_category: { name: 'Marketing' } },
      { transaction_type: 'expense', transaction_date: '2026-09-12', amount: 10, expense_category: { name: 'Marketing' } },
      { transaction_type: 'expense', transaction_date: '2026-09-14', amount: 20, expense_category: { name: 'Marketing' } },
      { transaction_type: 'expense', transaction_date: '2026-09-15', amount: 60, expense_category: { name: 'Marketing' } },
    ], { start: '2026-09-12', end: '2026-09-14' })).toBe(30);
  });

  it('shows only revenue and Marketing expenses in the CRM visual', () => {
    const display = crmFinanceDisplay(1000, 50);
    expect(display.bars).toEqual([
      { label: 'Revenue', value: 1000, tone: 'bg-teal-600' },
      { label: 'Marketing Expenses', value: 50, tone: 'bg-rose-400' },
    ]);
    expect(crmFinanceDisplay(1000, null).bars[1].value).toBeNull();
  });
});
