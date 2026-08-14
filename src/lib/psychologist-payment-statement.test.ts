import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOfficialReport } from './official-document-engine';
import { canGeneratePsychologistPaymentStatements, canViewPsychologistPaymentStatements } from './psychologist-payment-statement-access';
import { psychologistPaymentStatementFilename, psychologistPaymentStatementReport, type PsychologistPaymentStatement, type PsychologistPaymentStatementItem } from './psychologist-payment-statement';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260814054449_psychologist_payment_statements.sql'), 'utf8');
const generateRoute = readFileSync(resolve(process.cwd(), 'src/app/api/finance/psychologist-payment-statements/route.ts'), 'utf8');
const downloadRoute = readFileSync(resolve(process.cwd(), 'src/app/api/finance/psychologist-payment-statements/[statementId]/download/route.ts'), 'utf8');

const statement: PsychologistPaymentStatement = {
  id: 'statement-id', statement_number: 'PS-2026-000015', psychologist_id: 'doctor-id',
  psychologist_name: 'Dr. Example', period_start: '2026-08-01', period_end: '2026-08-15',
  statement_date: '2026-08-16', payment_status: 'payment_due', session_count: 1,
  total_amount: '800.00', currency: 'INR', paid_date_from: null, paid_date_to: null,
  payment_references: [], version: 1,
};
const item = (index: number, amount = 800): PsychologistPaymentStatementItem => ({
  payable_id: `payable-${index}`, line_number: index, session_date: '2026-08-02',
  session_reference: `Session #${String(index).padStart(3, '0')}`, due_date: '2026-08-16',
  payable_amount: amount, currency: 'INR', payable_status: 'payment_due', paid_at: null, payment_reference: null,
});

describe('psychologist payment statements', () => {
  it('renders one immutable payable snapshot with a professional filename', () => {
    const report = psychologistPaymentStatementReport(statement, [item(1)]);
    expect(report.heading).toBe('PSYCHOLOGIST PAYMENT STATEMENT');
    expect(report.rows).toHaveLength(1);
    expect(report.totals).toContainEqual({ label: 'Total Payable', value: '₹800.00' });
    expect(psychologistPaymentStatementFilename(statement)).toBe('BSmile_Psychologist_Payment_Statement_Dr_Example_2026-08-01_to_2026-08-15.pdf');
  });

  it('calculates and verifies multiple lines from historical payable amounts', () => {
    const items = [item(1, 800), item(2, 900), item(3, 750)];
    const report = psychologistPaymentStatementReport({ ...statement, session_count: 3, total_amount: 2450 }, items);
    expect(report.totals).toContainEqual({ label: 'Total Payable', value: '₹2,450.00' });
    expect(() => psychologistPaymentStatementReport({ ...statement, session_count: 3, total_amount: 9999 }, items)).toThrow(/total/i);
  });

  it('renders only recorded paid metadata and labels the result as paid', () => {
    const paid = { ...statement, payment_status: 'paid' as const, paid_date_from: '2026-08-18', paid_date_to: '2026-08-18', payment_references: ['BANK-123'] };
    const report = psychologistPaymentStatementReport(paid, [{ ...item(1), payable_status: 'paid', paid_at: '2026-08-18T00:00:00Z', payment_reference: 'BANK-123' }]);
    expect(report.filters?.join(' ')).toContain('BANK-123');
    expect(report.totals).toContainEqual({ label: 'Status', value: 'PAID' });
    expect(psychologistPaymentStatementFilename(paid)).toMatch(/_Paid\.pdf$/);
  });

  it('paginates 50+ statement lines on the Batch 1 letterhead report engine', async () => {
    const items = Array.from({ length: 55 }, (_, index) => item(index + 1));
    const report = psychologistPaymentStatementReport({ ...statement, session_count: items.length, total_amount: 44000 }, items);
    const pdf = await generateOfficialReport(report);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.pageCount).toBeGreaterThan(1);
  });

  it('enforces payable ID snapshots, date range, status, psychologist, and cancelled exclusions in SQL', () => {
    expect(migration).toContain('unique (statement_id, payable_id)');
    expect(migration).toContain('min(payable.session_date), max(payable.session_date), sum(payable.payable_amount)');
    expect(migration).toContain("selected_psychologists <> 1");
    expect(migration).toContain("payable.status in ('payment_due', 'scheduled', 'on_hold')");
    expect(migration).toContain('cancelled payables are ineligible');
    expect(migration).toContain('Regeneration must preserve the exact payable selection.');
    expect(migration).not.toContain('default_session_payout');
  });

  it('stores no clinical content and uses private, audited server routes', () => {
    const combined = `${migration}\n${generateRoute}\n${downloadRoute}`.toLowerCase();
    expect(combined).not.toMatch(/clinical_notes|therapy_notes|diagnosis|patient_name|client_name/);
    expect(generateRoute).toContain("storage.from('employee-documents').upload");
    expect(generateRoute).toContain('upsert: false');
    expect(downloadRoute).toContain('record_psychologist_payment_statement_download');
    expect(downloadRoute).toContain("'Cache-Control': 'private, no-store, max-age=0'");
  });

  it('denies ordinary Staff without both finance and document permissions', async () => {
    const deniedDb = { rpc: async () => ({ data: false }) };
    expect(await canViewPsychologistPaymentStatements(deniedDb)).toBe(false);
    expect(await canGeneratePsychologistPaymentStatements(deniedDb)).toBe(false);
    const allowedDb = { rpc: async (_name: string, args: { permission_code: string }) => ({ data: ['psychologist_payments.view', 'psychologist_payments.manage', 'documents.manage'].includes(args.permission_code) }) };
    expect(await canViewPsychologistPaymentStatements(allowedDb)).toBe(true);
    expect(await canGeneratePsychologistPaymentStatements(allowedDb)).toBe(true);
  });
});
