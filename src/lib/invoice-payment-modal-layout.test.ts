import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../app/admin/finance/invoices/[id]/page.tsx', import.meta.url), 'utf8');

describe('invoice payment modal layout', () => {
  it('keeps the payment submit action reachable in constrained viewports', () => {
    expect(source).toContain('max-h-[90vh]');
    expect(source).toContain('overflow-y-auto');
    expect(source).toContain('flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden');
    expect(source).toContain('flex shrink-0 justify-end gap-2 border-t');
  });

  it('requires the payment method field before submission', () => {
    expect(source).toContain('<select required className="input" value={payment.payment_method}');
  });
});
