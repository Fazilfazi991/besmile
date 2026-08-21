export const canonicalExpenseCategoryNames = [
  'Capital Expense',
  'Monthly Expense',
  'Maintenance',
] as const;

export type CanonicalExpenseCategoryName = typeof canonicalExpenseCategoryNames[number];

export const isCanonicalExpenseCategory = (name?: string | null): name is CanonicalExpenseCategoryName =>
  canonicalExpenseCategoryNames.includes(name as CanonicalExpenseCategoryName);

export const expenseCategoryHelp: Record<CanonicalExpenseCategoryName, string> = {
  'Capital Expense': 'Assets or major purchases such as laptops, furniture, or equipment.',
  'Monthly Expense': 'Regular operating costs such as salary, rent, marketing, subscriptions, and utilities.',
  Maintenance: 'Repair, servicing, upkeep, and maintenance costs.',
};
