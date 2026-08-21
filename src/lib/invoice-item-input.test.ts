import { describe, expect, it } from 'vitest';
import { invoiceDraftLineTotal, invoiceDraftNumber, invoiceDraftValues, newInvoiceItemDraft } from './invoice-item-input';
import { invoiceTotal, invoiceValidationMessage } from './finance-rules';

describe('invoice item numeric drafts', () => {
  it('defaults a new line to the existing intended quantity and rate', () => {
    expect(newInvoiceItemDraft()).toEqual({ description: '', quantity: '1', rate: '0' });
  });

  it('keeps quantity and rate blank while the user clears or replaces them', () => {
    const draft = { description: 'Session', quantity: '', rate: '' };
    expect(draft.quantity).toBe('');
    expect(draft.rate).toBe('');
    expect(invoiceDraftNumber(draft.quantity)).toBeNaN();
    expect(invoiceDraftNumber(draft.rate)).toBeNaN();
    expect(invoiceDraftValues([{ ...draft, quantity: '3', rate: '500' }])).toEqual([{ description: 'Session', quantity: 3, rate: 500 }]);
  });

  it('preserves direct, partial, decimal, backspace, delete, and Ctrl+A replacements as text', () => {
    expect(['', '3', '1.5', '2.25']).toEqual(['', '3', '1.5', '2.25']);
    expect(['', '500', '99.50']).toEqual(['', '500', '99.50']);
    expect(invoiceDraftNumber('3')).toBe(3);
    expect(invoiceDraftNumber('1.5')).toBe(1.5);
    expect(invoiceDraftNumber('99.50')).toBe(99.5);
    expect('500').not.toBe('0500');
    expect('3').not.toMatch(/^1\.(?:0?3|3)$/);
  });

  it('recalculates line, subtotal, discount, and tax from numeric values only', () => {
    const items = invoiceDraftValues([
      { description: 'Session', quantity: '3', rate: '500' },
      { description: 'Assessment', quantity: '1.5', rate: '200' },
    ]);
    expect(invoiceDraftLineTotal({ description: 'Session', quantity: '3', rate: '500' })).toBe(1500);
    expect(items.reduce((sum, item) => sum + item.quantity * item.rate, 0)).toBe(1800);
    expect(invoiceTotal(items, 100, 50)).toBe(1750);
  });

  it('rejects blank, invalid, and non-positive values at submit time while preserving existing-value edits', () => {
    expect(invoiceValidationMessage(invoiceDraftValues([{ description: 'Session', quantity: '', rate: '500' }]))).toMatch(/quantity/i);
    expect(invoiceValidationMessage(invoiceDraftValues([{ description: 'Session', quantity: '3', rate: '' }]))).toMatch(/rate/i);
    expect(invoiceValidationMessage(invoiceDraftValues([{ description: 'Existing line', quantity: '3', rate: '650' }]))).toBeNull();
  });
});
