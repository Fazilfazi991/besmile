import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0082_doctor_scheduling_module.sql'), 'utf8');

describe('doctor scheduling migration', () => {
  it('creates scoped tables, permissions, RLS, and conflict prevention', () => {
    for (const table of ['outsourced_doctors', 'doctor_weekly_availability', 'doctor_blocked_periods', 'doctor_appointments', 'doctor_appointment_activity']) {
      expect(migration).toContain(`public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("'doctor_scheduling.view'");
    expect(migration).toContain('doctor_appointments_no_overlap');
    expect(migration).toContain('doctor_slot_is_available');
    expect(migration).toContain('create_doctor_appointment');
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration).not.toContain('using (true)');
  });
});
