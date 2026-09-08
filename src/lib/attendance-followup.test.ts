import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attendanceException, requiredWorkingMinutes } from './attendance-rules';

const settings = { timezone: 'Asia/Kolkata', work_start: '09:00', work_end: '18:00', grace_minutes: 10, overtime_after_minutes: 480, working_days: [1, 2, 3, 4, 5] };
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260908195341_attendance_regularization_and_leave_configuration.sql'), 'utf8');
const dataApiGrantMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260908205058_grant_attendance_regularization_data_api_access.sql'), 'utf8');

describe('attendance follow-up rules', () => {
  it('uses the canonical configured day length rather than a duplicate hard-coded rule', () => expect(requiredWorkingMinutes(settings)).toBe(480));
  it('flags completed attendance below the configured requirement', () => expect(attendanceException({ work_date: '2026-09-07', clock_in: '2026-09-07T03:30:00Z', clock_out: '2026-09-07T10:30:00Z', break_minutes: 0 }, settings, { workDate: '2026-09-07', now: new Date('2026-09-08T05:00:00Z') })).toBe('under_hours'));
  it('flags a historical missing punch but not an active day before the shift cutoff', () => {
    expect(attendanceException({ work_date: '2026-09-07', clock_in: '2026-09-07T03:30:00Z' }, settings, { workDate: '2026-09-07', now: new Date('2026-09-08T05:00:00Z') })).toBe('missing_punch');
    expect(attendanceException({ work_date: '2026-09-08', clock_in: '2026-09-08T03:30:00Z' }, settings, { workDate: '2026-09-08', now: new Date('2026-09-08T05:00:00Z') })).toBeNull();
  });
  it('keeps regularized rows out of the exception queue', () => expect(attendanceException({ work_date: '2026-09-07', status: 'regularized', clock_in: '2026-09-07T03:30:00Z' }, settings, { workDate: '2026-09-07', now: new Date('2026-09-08T05:00:00Z') })).toBeNull());
  it('uses an auditable, RLS-protected request rather than overwriting original punches', () => {
    expect(migration).toContain('attendance_regularization_requests');
    expect(migration).toContain('attendance_regularization_reviewer_can_act');
    expect(migration).toContain("set status = 'regularized'");
    expect(migration).toContain('enable row level security');
    expect(migration).toContain("code = 'annual'");
  });
  it('exposes regularization only to authenticated Data API clients while retaining RLS', () => {
    expect(dataApiGrantMigration).toContain('revoke all on table public.attendance_regularization_requests from anon');
    expect(dataApiGrantMigration).toContain('grant select, insert, update on table public.attendance_regularization_requests to authenticated');
    expect(dataApiGrantMigration).not.toContain('to anon;');
  });
});
