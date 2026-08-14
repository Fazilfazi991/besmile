import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260814143000_outsourced_clinician_payable_sync.sql'), 'utf8');
const payments = readFileSync(resolve(process.cwd(), 'src/components/psychologist-session-payables.tsx'), 'utf8');
const scheduling = readFileSync(resolve(process.cwd(), 'src/components/doctor-scheduling.tsx'), 'utf8');

describe('outsourced clinician payable sync', () => {
  it('uses the scheduling clinician foreign key and snapshots the completed session facts', () => {
    expect(sql).toContain('where id=appointment.doctor_id and archived_at is null');
    expect(sql).toContain('clinician_name_snapshot');
    expect(sql).toContain('session_duration_minutes');
    expect(sql).toContain('psychologist_rate');
    expect(sql).toContain("'INR'");
  });

  it('creates one payable only for a past completed outsourced appointment with a valid rate', () => {
    expect(sql).toContain("appointment.status <> 'completed'");
    expect(sql).toContain('appointment.end_at > now()');
    expect(sql).toContain("clinician.clinician_type <> 'outsourced'");
    expect(sql).toContain('on conflict(appointment_id) do nothing');
    expect(sql).toContain("'missing_rate'");
    expect(sql).not.toContain("appointment.consultation_type <> 'online'");
  });

  it('excludes staff and interns without exposing finance mutations in scheduling', () => {
    expect(sql).toContain("clinician.clinician_type <> 'outsourced'");
    expect(scheduling).not.toContain('Submit session record');
    expect(scheduling).toContain('Finance → Psychologist Payments');
  });

  it('safely cancels unpaid corrections and blocks paid history from silent mutation', () => {
    expect(sql).toContain("old.status='completed'");
    expect(sql).toContain("status='cancelled'");
    expect(sql).toContain("payable.status='paid' or payable.finance_transaction_id is not null");
    expect(sql).toContain('requires an authorized financial reversal');
  });

  it('shows active outsourced scheduling clinicians even before they have payables', () => {
    expect(sql).toContain("clinician.clinician_type='outsourced'");
    expect(sql).toContain("not public.has_permission('psychologist_payments.view')");
    expect(payments).toContain("rpc('eligible_psychologist_payment_clinicians')");
    expect(payments).toContain('Payment configuration required');
    expect(payments).toContain("onConflict: 'doctor_id'");
    expect(payments).toContain("select('status,payable_amount,due_date')");
  });
});
