import { describe, expect, it } from 'vitest';
import { businessDateKey } from './business-time';
import { effectiveInvoiceStatus } from './finance-rules';

describe('effective invoice status', () => {
  it('keeps list filters consistent with the displayed overdue badge', () => {
    const today = '2026-08-08';
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-09' }, today)).toBe('sent');
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-07' }, today)).toBe('overdue');
    expect(effectiveInvoiceStatus({ status: 'partially_paid', due_date: '2026-08-07' }, today)).toBe('overdue');
    expect(effectiveInvoiceStatus({ status: 'paid', due_date: '2026-08-07' }, today)).toBe('paid');
    expect(effectiveInvoiceStatus({ status: 'cancelled', due_date: '2026-08-07' }, today)).toBe('cancelled');
  });

  it('uses the Asia/Kolkata business date at a UTC boundary', () => {
    expect(businessDateKey(new Date('2026-08-07T20:00:00Z'))).toBe('2026-08-08');
  });
});
