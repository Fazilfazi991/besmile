import { describe, expect, it } from 'vitest';
import { availableFinanceOptions, financeEntryValidationMessage } from './finance-master-data-rules';

describe('finance master data rules', () => {
  it('keeps active accounts and categories available for both income and expenses', () => {
    expect(availableFinanceOptions([{ id: 'cash', name: 'Cash', is_active: true }, { id: 'old', name: 'Old account', is_active: false }]))
      .toEqual([{ id: 'cash', name: 'Cash', is_active: true }]);
  });

  it('requires a positive amount, account, and category before saving', () => {
    expect(financeEntryValidationMessage({ amount: 0, accountId: 'cash', categoryId: 'rent' })).toBe('Enter an amount greater than zero.');
    expect(financeEntryValidationMessage({ amount: 25, categoryId: 'rent' })).toBe('Select an account.');
    expect(financeEntryValidationMessage({ amount: 25, accountId: 'cash' })).toBe('Select a category.');
    expect(financeEntryValidationMessage({ amount: 25, accountId: 'cash', categoryId: 'rent' })).toBeNull();
  });
});
