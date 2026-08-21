import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalExpenseCategoryNames, expenseCategoryHelp, isCanonicalExpenseCategory } from './finance-expense-categories';
import { financeTotals } from './finance-rules';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260821110000_simplify_finance_expense_categories.sql'), 'utf8');
const form = readFileSync(resolve(process.cwd(), 'src/components/finance-transactions.tsx'), 'utf8');

describe('simplified finance expense categories', () => {
  it('exposes exactly the three required user-facing categories', () => {
    expect(canonicalExpenseCategoryNames).toEqual(['Capital Expense', 'Monthly Expense', 'Maintenance']);
    expect(isCanonicalExpenseCategory('Capital Expense')).toBe(true);
    expect(isCanonicalExpenseCategory('Monthly Expense')).toBe(true);
    expect(isCanonicalExpenseCategory('Maintenance')).toBe(true);
    expect(isCanonicalExpenseCategory('Marketing')).toBe(false);
    expect(isCanonicalExpenseCategory('Website')).toBe(false);
    expect(expenseCategoryHelp['Monthly Expense']).toMatch(/marketing/i);
  });

  it('uses the same canonical list for expense creation, editing, and filtering', () => {
    expect(form).toMatch(/options\.expense\.filter\(\(category: any\) =>\s*isCanonicalExpenseCategory\(category\.name\)/);
    expect(form).toContain("Select Capital Expense, Monthly Expense, or Maintenance.");
    expect(form).toContain('categoryGuidance');
    expect(form).toContain('Field label="Description"');
  });

  it('maps known historical categories safely and leaves ambiguous legacy history readable', () => {
    expect(migration).toContain("'salary', 'rent', 'utilities', 'marketing'");
    expect(migration).toContain("'capital', 'capital expense', 'equipment'");
    expect(migration).toContain("'maintenance', 'repair', 'repairs'");
    expect(migration).toContain('including the ambiguous "Other", are deliberately preserved as-is');
    expect(migration).toContain("set is_active = false");
  });

  it('classifies payroll and psychologist payments as Monthly Expense without changing their origins', () => {
    expect(migration).toContain("transaction.transaction_type in ('payroll_payment', 'psychologist_payment')");
    expect(migration).toContain("select 'payroll_payment', target_account, id");
    expect(migration).toContain("'psychologist_payment',target_account,id");
    expect(migration).toContain("name='Monthly Expense' and is_active");
    expect(financeTotals([{ transaction_type: 'payroll_payment', amount: 100 }, { transaction_type: 'psychologist_payment', amount: 50 }])).toEqual({ income: 0, expenses: 150 });
  });

  it('enforces canonical categories at the database layer without changing RLS', () => {
    expect(migration).toContain("new.transaction_type in ('expense', 'payroll_payment', 'psychologist_payment')");
    expect(migration).toContain("name in ('Capital Expense', 'Monthly Expense', 'Maintenance')");
    expect(migration).toContain("raise exception 'Select Capital Expense, Monthly Expense, or Maintenance.'");
    expect(migration).not.toContain('create policy');
    expect(migration).not.toContain('drop policy');
  });
});
