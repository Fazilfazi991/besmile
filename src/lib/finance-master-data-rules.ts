export type FinanceOption = { id: string; name: string; is_active?: boolean | null };

export function availableFinanceOptions<T extends FinanceOption>(items: T[]) {
  return items.filter(item => item.is_active !== false);
}

export function financeEntryValidationMessage({ amount, accountId, categoryId }: { amount: unknown; accountId?: string; categoryId?: string }) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return 'Enter an amount greater than zero.';
  if (!accountId) return 'Select an account.';
  if (!categoryId) return 'Select a category.';
  return null;
}
