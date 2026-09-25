import { describe, expect, it } from 'vitest';
import { canonicalExpenseCategory, expenseCategoryOrder, marketingExpenseValidationMessage, orderExpenseOptions, orderExpenseReportRows } from './expense-categories';

describe('Finance expense categories', () => {
  it('orders the six canonical choices independently of amounts or database order', () => {
    const names = ['Other', 'Marketing', 'Capital', 'Operations', 'Admin & Utilities', 'Salaries'];
    expect(orderExpenseOptions(names.map(name => ({ name }))).map(row => row.name)).toEqual(expenseCategoryOrder);
  });

  it('groups historical category labels without changing amounts', () => {
    expect(canonicalExpenseCategory('Payroll')).toBe('Salaries');
    expect(canonicalExpenseCategory('Utilities')).toBe('Admin & Utilities');
    expect(canonicalExpenseCategory('Unknown')).toBe('Other');
  });

  it('orders the expense report by canonical category', () => {
    const rows = [{ expense_category: { name: 'Other' } }, { expense_category: { name: 'Marketing' } }, { expense_category: { name: 'Salary' } }, { expense_category: { name: 'Operations' } }];
    expect(orderExpenseReportRows(rows).map(row => canonicalExpenseCategory(row.expense_category.name))).toEqual(['Operations', 'Salaries', 'Marketing', 'Other']);
  });

  it('requires a comment for Other Marketing Expenses', () => {
    expect(marketingExpenseValidationMessage('Marketing', 'Other Marketing Expenses', ' ')).toMatch(/comment/i);
    expect(marketingExpenseValidationMessage('Marketing', 'Other Marketing Expenses', 'Campaign note')).toBeNull();
    expect(marketingExpenseValidationMessage('Operations', undefined, '')).toBeNull();
  });
});
