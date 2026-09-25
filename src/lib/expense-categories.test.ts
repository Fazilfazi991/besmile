import { describe, expect, it } from 'vitest';
import { canonicalExpenseCategory, expenseCategoryOrder, marketingExpenseValidationMessage, orderExpenseOptions, orderExpenseReportRows } from './expense-categories';

describe('Finance expense categories', () => {
  it('orders the six canonical choices independently of amounts or database order', () => {
    const names = ['Other', 'Marketing', 'Capital', 'Psychologist session payout', 'Admin & Utilities', 'Monthly Expenses'];
    expect(orderExpenseOptions(names.map(name => ({ name }))).map(row => canonicalExpenseCategory(row.name))).toEqual(expenseCategoryOrder);
  });

  it('displays the psychologist category consistently and preserves inactive historical labels', () => {
    expect(canonicalExpenseCategory('Psychologist session payout')).toBe('Psychologist Session Payout');
    expect(canonicalExpenseCategory('Maintenance')).toBe('Maintenance');
    expect(canonicalExpenseCategory('Monthly Expense')).toBe('Monthly Expense');
  });

  it('orders the expense report by canonical category', () => {
    const rows = [{ expense_category: { name: 'Other' } }, { expense_category: { name: 'Maintenance' } }, { expense_category: { name: 'Marketing' } }, { expense_category: { name: 'Psychologist session payout' } }, { expense_category: { name: 'Capital' } }];
    expect(orderExpenseReportRows(rows).map(row => canonicalExpenseCategory(row.expense_category.name))).toEqual(['Capital', 'Marketing', 'Psychologist Session Payout', 'Other', 'Maintenance']);
  });

  it('requires a comment for Other Marketing Expenses', () => {
    expect(marketingExpenseValidationMessage('Marketing', 'Other Marketing Expenses', ' ')).toMatch(/comment/i);
    expect(marketingExpenseValidationMessage('Marketing', 'Other Marketing Expenses', 'Campaign note')).toBeNull();
    expect(marketingExpenseValidationMessage('Operations', undefined, '')).toBeNull();
  });
});
