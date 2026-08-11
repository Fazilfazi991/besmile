import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260811033925_fix_attendance_geofence_finite_validation.sql', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

describe('attendance geofence production correction', () => {
  it('replaces unsupported double-precision isfinite validation without weakening the RPC', () => {
    expect(migration).not.toContain('isfinite(');
    expect(migration).toContain("'NaN'::double precision");
    expect(migration).toContain("'Infinity'::double precision");
    expect(migration).toContain("'Only active employees can record self-attendance'");
    expect(migration).toContain('security definer set search_path=public');
    expect(migration).toContain('distance_metres > settings.attendance_geofence_radius_metres');
    expect(migration).toContain('p_accuracy_metres > settings.attendance_max_accuracy_metres');
  });

  it('keeps the one shared management-dashboard attendance flow before Team Today', () => {
    expect(dashboard).toContain("employeeRepository.clockIn(profile.id, await freshLocation('Clock In'))");
    expect(dashboard).toContain("employeeRepository.clockOut(todayAttendance.id, await freshLocation('Clock Out'))");
    expect(dashboard.indexOf('my-attendance-card')).toBeLessThan(dashboard.indexOf('{canViewTeam && <TeamAttendanceStrip'));
  });
});
