import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('invoice creation consistency', () => {
  it('creates the header and line items in one permission-checked transaction', () => {
    const sql = readFileSync('supabase/migrations/20260813081100_atomic_invoice_creation.sql', 'utf8');
    const repository = readFileSync('src/lib/admin-repository.ts', 'utf8');
    expect(sql).toContain('create_finance_invoice_atomic');
    expect(sql).toContain("has_permission('invoices.manage')");
    expect(sql).toContain('jsonb_array_length(item_rows) = 0');
    expect(sql).toContain('insert into public.finance_invoice_items');
    expect(repository).toContain("rpc('create_finance_invoice_atomic'");
    expect(repository).not.toContain("await r.from('finance_invoices').delete().eq('id',data.id)");
  });
});
