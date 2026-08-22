import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260822033729_appointment_psychologist_payable_snapshot.sql', import.meta.url), 'utf8');
const scheduling = readFileSync(new URL('../../src/components/doctor-scheduling.tsx', import.meta.url), 'utf8');
const payments = readFileSync(new URL('../../src/components/psychologist-session-payables.tsx', import.meta.url), 'utf8');

describe('appointment psychologist payable lifecycle', () => {
  it('snapshots the configured outsourced fee when booking and exposes it in both appointment forms', () => {
    expect(migration).toContain('psychologist_fee_snapshot numeric(14,2)');
    expect(migration).toContain('configured_fee');
    expect(migration).toContain('appointment_psychologist_payment_rates()');
    expect(scheduling.match(/Psychologist fee/g)?.length).toBe(2);
  });

  it('creates no payable on booking and creates one only after an outsourced appointment completes', () => {
    expect(migration).toContain("appointment.status <> 'completed'");
    expect(migration).toContain("clinician.clinician_type <> 'outsourced'");
    expect(migration).toContain('on conflict(appointment_id) do nothing');
    expect(migration).not.toContain('after insert on public.doctor_appointments');
  });

  it('uses the appointment snapshot rather than the clinician current rate and disables historical reconciliation', () => {
    expect(migration).toContain('appointment.psychologist_fee_snapshot,appointment.psychologist_fee_snapshot');
    expect(migration).toContain('drop trigger if exists psychologist_payout_settings_reconcile_payables');
    expect(migration).not.toContain('setting.default_session_payout,setting.default_session_payout');
  });

  it('keeps settlement permission separate and shows the payable audit fields', () => {
    expect(payments).toContain("permissions.has('psychologist_payments.settle')");
    expect(payments).toContain('canSettlePermission && x.status');
    expect(payments).toContain('paid_by_profile');
    expect(payments).toContain('session_duration_minutes');
  });
});
