import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminRouteRequirement, employeeNavigation, employeeRouteRequirement, filterNavigation, permissionAllows } from './permission-access';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822110000_restore_intern_self_attendance.sql'),
  'utf8',
);

describe('Intern self-attendance access', () => {
  const intern = new Set(['attendance.self']);

  it('routes an Intern to personal attendance and never staff attendance', () => {
    expect(permissionAllows(intern, employeeRouteRequirement('/employee/attendance'))).toBe(true);
    expect(permissionAllows(intern, adminRouteRequirement('/admin/attendance'))).toBe(false);
    const labels = filterNavigation(employeeNavigation, intern).flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toContain('My Attendance');
    expect(labels).not.toContain('Staff Attendance');
  });

  it('grants only the canonical self-service permission to the Intern role', () => {
    expect(migration).toContain("select 'Intern'::public.employee_role, permission.id");
    expect(migration).toContain("where permission.code = 'attendance.self'");
    expect(migration).toContain("when 'intern' then 'attendance.self'");
    expect(migration).not.toMatch(/attendance\.(?:view|view_team|manage)/);
  });

  it('retains the verified, self-scoped attendance RPC contract', () => {
    expect(migration).not.toContain('record_self_attendance_location');
    const rpc = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260811033925_fix_attendance_geofence_finite_validation.sql'), 'utf8');
    expect(rpc).toContain('profile_id=auth.uid()');
    expect(rpc).toContain('p_accuracy_metres > settings.attendance_max_accuracy_metres');
    expect(rpc).toContain('distance_metres > settings.attendance_geofence_radius_metres');
  });
});
