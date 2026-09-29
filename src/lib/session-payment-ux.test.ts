import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync('src/components/patient-workspace.tsx', 'utf8');
const route = readFileSync('src/app/api/patients/[patientId]/manage/route.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260929184700_session_payment_ux_correction.sql', 'utf8');

describe('session payment UX correction', () => {
  it('defaults session creation to an unpaid charge and makes immediate payment explicit', () => {
    expect(workspace).toContain('Session Fee (INR)');
    expect(workspace).toContain('Record payment now');
    expect(workspace).toContain('checked={recordPaymentNow}');
    expect(route).toContain("received_amount:Number(payload.received_amount||0)");
    expect(migration).not.toContain("if target_fee>0 and not (public.has_permission('invoices.manage')");
    expect(migration).toContain("if total_paid>0 and not (public.has_permission('invoices.manage')");
  });

  it('records later payments only through the canonical atomic RPC', () => {
    expect(workspace).toContain('Add Payment');
    expect(workspace).toContain('Record Payment');
    expect(route).toContain("kind==='payment'");
    expect(route).toContain("rpc('record_invoice_payment_atomic'");
    expect(route).toContain(".not('patient_session_id','is',null)");
    expect(route).not.toMatch(/from\('finance_invoice_payments'\)\.insert/);
  });

  it('keeps Finance authorization separate from session creation', () => {
    expect(workspace).toContain("perms['invoices.manage'] || perms['finance.manage']");
    expect(route).toContain("allowed(db,'invoices.manage')");
    expect(route).toContain("allowed(db,'finance.manage')");
    expect(migration).toContain("public.has_permission('patient_sessions.create')");
    expect(migration).toContain("Finance permission is required to record a session payment.");
  });

  it('preserves backend overpayment and idempotency enforcement', () => {
    const releaseTwo = readFileSync('supabase/migrations/20260929110000_release_2_workflows_and_client_sessions.sql', 'utf8');
    expect(releaseTwo).toContain("if payment_amount>total-paid then raise exception 'Payment exceeds the outstanding balance.'");
    expect(releaseTwo).toContain('finance_invoice_payment_request_unique');
    expect(releaseTwo).toContain('payment.idempotency_payload is distinct from request_payload');
    expect(workspace).toContain('max={finance.outstanding}');
  });
});
