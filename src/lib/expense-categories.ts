export const expenseCategoryOrder = [
  'Capital',
  'Monthly Expenses',
  'Marketing',
  'Admin & Utilities',
  'Psychologist Session Payout',
  'Other',
] as const;

export function canonicalExpenseCategory(name: string | null | undefined) {
  if (!name) return 'Other';
  return name === 'Psychologist session payout' ? 'Psychologist Session Payout' : name;
}
