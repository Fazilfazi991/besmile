import { describe, expect, it } from 'vitest';
import { conversionBalance, conversionPaymentValidation, type ConversionPaymentInput } from './conversion-payment';

const input = (patch: Partial<ConversionPaymentInput> = {}): ConversionPaymentInput => ({
  sale_value: '1000', payment_received: '400', invoice_due_date: '2026-10-01',
  receiving_account: 'account', payment_method: 'cash', payment_date: '2026-09-23',
  payment_reference: '', ...patch,
});

describe('conversion payment rules', () => {
  it('derives only the unpaid amount as balance', () => {
    expect(conversionBalance('1000', '1000')).toBe(0);
    expect(conversionBalance('1000', '400')).toBe(600);
    expect(conversionBalance('1000', '0')).toBe(1000);
  });
  it('rejects overpayment and missing accounting inputs', () => {
    expect(conversionPaymentValidation(input({ payment_received: '1001' }), '2026-09-23', true)).toMatch(/cannot exceed/i);
    expect(conversionPaymentValidation(input({ receiving_account: '' }), '2026-09-23', true)).toMatch(/account/i);
    expect(conversionPaymentValidation(input({ invoice_due_date: '' }), '2026-09-23', true)).toMatch(/due date/i);
  });
  it('allows full, partial, and unpaid conversions with correct authority', () => {
    expect(conversionPaymentValidation(input({ payment_received: '1000', invoice_due_date: '' }), '2026-09-23', true)).toBeNull();
    expect(conversionPaymentValidation(input(), '2026-09-23', true)).toBeNull();
    expect(conversionPaymentValidation(input({ payment_received: '0', receiving_account: '' }), '2026-09-23', false)).toBeNull();
  });
});
