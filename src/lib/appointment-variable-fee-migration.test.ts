import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260909194641_appointment_hourly_cadence_and_variable_fee.sql', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./doctor-scheduling-repository.ts', import.meta.url), 'utf8');

describe('appointment variable fee migration', () => {
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
