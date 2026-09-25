export const expenseCategoryOrder = [
  'Operations',
  'Salaries',
  'Marketing',
  'Admin & Utilities',
  'Capital',
  'Other',
] as const;

export const marketingExpenseTypes = [
  'Digital Marketing Expenses',
  'Performance Marketing Expenses',
  'Other Marketing Expenses',
] as const;

const legacyCategoryNames: Record<string, typeof expenseCategoryOrder[number]> = {
  Salary: 'Salaries',
  Payroll: 'Salaries',
  Rent: 'Admin & Utilities',
  Utilities: 'Admin & Utilities',
  Office: 'Admin & Utilities',
  Software: 'Operations',
  Travel: 'Operations',
};

export function canonicalExpenseCategory(name: string | null | undefined) {
  if (!name) return 'Other';
  return (expenseCategoryOrder as readonly string[]).includes(name) ? name : legacyCategoryNames[name] || 'Other';
}

export function orderExpenseOptions<T extends { name: string }>(options: T[]) {
  return [...options].sort((a, b) => {
    const aIndex = expenseCategoryOrder.indexOf(a.name as typeof expenseCategoryOrder[number]);
    const bIndex = expenseCategoryOrder.indexOf(b.name as typeof expenseCategoryOrder[number]);
    return (aIndex < 0 ? expenseCategoryOrder.length : aIndex) - (bIndex < 0 ? expenseCategoryOrder.length : bIndex);
  });
}

export function orderExpenseReportRows<T extends { expense_category?: { name: string } | null }>(rows: T[]) {
  return [...rows].sort((a, b) => expenseCategoryOrder.indexOf(canonicalExpenseCategory(a.expense_category?.name) as typeof expenseCategoryOrder[number])
    - expenseCategoryOrder.indexOf(canonicalExpenseCategory(b.expense_category?.name) as typeof expenseCategoryOrder[number]));
}

export function marketingExpenseValidationMessage(categoryName: string | undefined, subtype: string | undefined, description: string | undefined) {
  if (categoryName !== 'Marketing') return null;
  if (!marketingExpenseTypes.includes(subtype as typeof marketingExpenseTypes[number])) return 'Select a Marketing expense type.';
  if (subtype === 'Other Marketing Expenses' && !description?.trim()) return 'Add a comment or description for Other Marketing Expenses.';
  return null;
}
