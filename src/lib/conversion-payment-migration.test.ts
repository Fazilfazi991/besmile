import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260923134429_conversion_payment_revenue_flow.sql'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('conversion payment migration', () => {
  it('keeps one invoice and one initial payment per sale', () => {
    expect(sql).toContain('finance_invoices_sale_unique');
    expect(sql).toContain('finance_invoice_payments_conversion_sale_unique');
    expect(sql).toContain('if found then\n    return sale_row;');
  });
  it('creates the receipt through the canonical invoice payment ledger', () => {
    expect(sql).toContain("'invoice_payment'");
    expect(sql).toContain('invoice_row.sale_id, invoice_row.id, invoice_row.patient_id');
    expect(sql).toContain('finance_transaction_id = ledger_id');
    expect(sql.match(/insert into public\.finance_invoice_payments/g)).toHaveLength(1);
  });
  it('validates overpayment, account selection, and atomic server-side writes', () => {
    expect(sql).toContain('Payment received cannot exceed the sale amount.');
    expect(sql).toContain('Choose an active receiving account.');
    expect(sql).toContain('security definer');
    expect(sql).not.toContain("permission.code = 'sales.record_payment'");
  });
  it('links sale, invoice, patient, payment, and transaction without backfill', () => {
    expect(sql).toContain('add column if not exists sale_id uuid references public.crm_sales');
    expect(sql).toContain('add column if not exists invoice_id uuid references public.finance_invoices');
    expect(sql).toContain('add column if not exists patient_id uuid references public.patients');
    expect(sql).not.toMatch(/update public\.crm_sales/i);
  });
});
