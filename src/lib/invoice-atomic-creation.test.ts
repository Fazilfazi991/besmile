import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('invoice creation consistency', () => {
  it('creates the header and line items in one permission-checked transaction', () => {
    const sql = readFileSync('supabase/migrations/20260813081100_atomic_invoice_creation.sql', 'utf8');
    const repository = readFileSync('src/lib/admin-repository.ts', 'utf8');
    const form = readFileSync('src/app/admin/finance/invoices/new/page.tsx', 'utf8');
    expect(sql).toContain('create_finance_invoice_atomic');
    expect(sql).toContain("has_permission('invoices.manage')");
    expect(sql).toContain('jsonb_array_length(item_rows) = 0');
    expect(sql).toContain('insert into public.finance_invoice_items');
    expect(repository).toMatch(/rpc\(\s*["']create_finance_invoice_atomic["']/);
    expect(repository).not.toContain("await r.from('finance_invoices').delete().eq('id',data.id)");
    expect(form).toContain('window.location.assign(`/admin/finance/invoices/${invoice.id}`)');
    expect(form).toContain('disabled={saving !== null}');
  });
  it('adds forward-only null, NaN, and total validation without changing the applied migration', () => {
    const migration = readFileSync('supabase/migrations/20260815024338_invoice_atomic_input_validation.sql', 'utf8');
    expect(migration).toContain('item.quantity is null');
    expect(migration).toContain("item.quantity = 'NaN'::numeric");
    expect(migration).toContain('item.rate is null');
    expect(migration).toContain("item.rate = 'NaN'::numeric");
    expect(migration).toContain('calculated_total < 0');
    expect(migration).toContain('target_issue_date is null');
  });
});
