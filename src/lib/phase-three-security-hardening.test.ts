import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260903184848_restrict_internal_appointment_audit_rpc.sql',
  'utf8',
).toLowerCase();

describe('phase three privileged RPC hardening', () => {
  it('keeps the caller-controlled appointment audit helper outside the public Data API', () => {
    expect(migration).toContain(
      'revoke all on function public.log_doctor_appointment_patient_activity(uuid, uuid, text, uuid, jsonb)',
    );
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain(
      'grant execute on function public.log_doctor_appointment_patient_activity(uuid, uuid, text, uuid, jsonb)',
    );
    expect(migration).toContain('to service_role');
  });
});
