import { describe, expect, it } from 'vitest';
import { executivePeriodRange, invoiceBalance, isActiveLead, percentageChange, usesExecutiveDashboard } from './executive-dashboard';

describe('director executive dashboard rules', () => {
  it('selects only the configured Director role', () => {
    expect(usesExecutiveDashboard('director')).toBe(true);
    expect(usesExecutiveDashboard('Director')).toBe(true);
    expect(usesExecutiveDashboard('general_manager')).toBe(false);
    expect(usesExecutiveDashboard('employee')).toBe(false);
    expect(usesExecutiveDashboard('clinician')).toBe(false);
    expect(usesExecutiveDashboard('chairman')).toBe(false);
  });

  it('calculates remaining invoice balance after partial payment', () => {
    expect(invoiceBalance({ tax: 50, discount: 20, finance_invoice_items: [{ quantity: 2, rate: 500 }], finance_invoice_payments: [{ amount: 400 }] })).toBe(630);
  });

  it('excludes terminal and archived leads from active leads', () => {
    expect(isActiveLead({ status: { name: 'Contacted' } })).toBe(true);
    expect(isActiveLead({ status: { name: 'Closed' } })).toBe(false);
    expect(isActiveLead({ status: { name: 'Disqualified' } })).toBe(false);
    expect(isActiveLead({ status: { name: 'Converted' }, converted_at: '2026-09-01' })).toBe(false);
    expect(isActiveLead({ archived_at: '2026-09-01' })).toBe(false);
  });

  it('handles comparisons and month boundaries truthfully', () => {
    expect(percentageChange(12, 0)).toBeNull();
    expect(percentageChange(120, 100)).toBe(20);
    expect(executivePeriodRange('previous_month', new Date('2026-01-15T12:00:00Z'), 'UTC')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});
