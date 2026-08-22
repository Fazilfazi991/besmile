import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260822052547_clinician_payout_configuration.sql', import.meta.url), 'utf8');
const scheduling = readFileSync(new URL('../../src/components/doctor-scheduling.tsx', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../../src/lib/doctor-scheduling-repository.ts', import.meta.url), 'utf8');

describe('clinician payout configuration', () => {
  it('configures only active outsourced clinicians at INR 800 and leaves historical payment records alone', () => {
    expect(migration).toContain("doctor.clinician_type = 'outsourced'");
    expect(migration).toContain("doctor.status = 'active'");
    expect(migration).toContain('doctor.archived_at is null');
    expect(migration).toContain('values (clinician.id, 800, true, null)');
    expect(migration).not.toMatch(/(?:update|insert into|delete from)\s+public\.(?:doctor_appointments|psychologist_session_payables|finance_transactions)/i);
  });

  it('initializes a new active outsourced clinician at INR 800 without assigning staff an outsourced payout', () => {
    expect(migration).toContain("if new.clinician_type = 'outsourced'");
    expect(migration).toContain("and new.status = 'active'");
    expect(migration).toContain('values (new.id, 800, true, new.updated_by)');
  });

  it('uses a narrow payout-setting permission for management and gives Aiswarya no settlement grant', () => {
    expect(migration).toContain("'psychologist_payout_settings.manage'");
    expect(migration).toContain("where profile.id = '4096a95f-970b-4542-8f18-cf5dd6a66150'::uuid");
    expect(migration).not.toContain('psychologist_payments.settle');
    expect(migration).toContain("public.has_permission('psychologist_payout_settings.manage')");
  });

  it('writes an audit record and keeps rate editing separate from appointment snapshots', () => {
    expect(migration).toContain("'psychologist_payout_setting_updated'");
    expect(migration).toContain("'previous_session_payout'");
    expect(migration).toContain("'new_session_payout'");
    expect(migration).toContain('set_psychologist_payout_setting');
  });

  it('shows the authorized Clinicians editor and keeps booking fees derived by the appointment RPC', () => {
    expect(repository).toContain("'psychologist_payout_settings.manage'");
    expect(repository).toContain("rpc('set_psychologist_payout_setting'");
    expect(scheduling).toContain('Psychologist Session Payout');
    expect(scheduling).toContain('This rate is snapshotted on new appointments.');
    expect(scheduling).toContain('psychologistPaymentRates()');
  });
});
