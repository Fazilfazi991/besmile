import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260909194641_appointment_hourly_cadence_and_variable_fee.sql', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./doctor-scheduling-repository.ts', import.meta.url), 'utf8');

describe('appointment variable fee migration', () => {
  it('keeps the internal payroll helper inaccessible to ordinary API callers in fresh and upgraded databases', () => {
    const repair = readFileSync(new URL('../../supabase/migrations/20260910193832_restrict_psychologist_payable_execution.sql', import.meta.url), 'utf8');
    for (const sql of [migration, repair]) {
      expect(sql).toContain('revoke all on function public.create_psychologist_session_payable(uuid) from public, anon, authenticated');
      expect(sql).toContain('grant execute on function public.create_psychologist_session_payable(uuid) to service_role');
      expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.create_psychologist_session_payable\(uuid\)\s+to[^;]*authenticated/i);
    }
    expect(repair).not.toMatch(/create\s+(or\s+replace\s+)?function|update\s+public\.|alter\s+table/i);
  });
  it('reuses the appointment fee snapshot without rewriting historical rows', () => {
    expect(migration).toContain('psychologist_fee_snapshot = appointment_fee');
    expect(migration).toContain('psychologist_fee_snapshot is null or psychologist_fee_snapshot >= 0');
    expect(migration).not.toMatch(/update public\.doctor_appointments\s+set psychologist_fee_snapshot/i);
  });

  it('validates and persists a scheduler-entered fee on create and edit', () => {
    expect(repository.match(/validateAppointmentFee\(payload\.appointmentFee\)/g)).toHaveLength(2);
    expect(repository.match(/appointment_fee: payload\.appointmentFee/g)).toHaveLength(2);
    expect(migration).toContain("'previous_appointment_fee', current_row.psychologist_fee_snapshot");
  });

  it('keeps the RPCs least privilege and anonymous callers denied', () => {
    expect(migration).toContain('grant insert, update on public.patients to authenticated');
    expect(migration).toContain('revoke all on function public.create_doctor_appointment');
    expect(migration).toContain('revoke all on function public.update_doctor_appointment');
    expect(migration).toContain('from public, anon');
    expect(migration).toContain('to authenticated, service_role');
  });
});
