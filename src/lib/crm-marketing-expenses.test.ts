import { describe, expect, it } from 'vitest';
import { marketingExpenseTotal } from './crm-marketing-expenses';
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
});
