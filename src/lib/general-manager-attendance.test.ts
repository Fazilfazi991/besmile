import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260807231500_general_manager_self_attendance.sql', import.meta.url), 'utf8');

describe('General Manager attendance', () => {
  it('uses the shared employee attendance actions in the management dashboard', () => {
    expect(dashboard).toContain('employeeRepository.attendanceHistory(signedInProfile.id)');
    expect(dashboard).toContain('employeeRepository.clockIn(profile.id)');
    expect(dashboard).toContain('employeeRepository.startBreak(todayAttendance.id)');
    expect(dashboard).toContain('employeeRepository.endBreak(activeBreak.id)');
    expect(dashboard).toContain('employeeRepository.clockOut(todayAttendance.id)');
  });

  it('grants GM self-service and company attendance visibility without attendance management authority', () => {
    expect(migration).toContain("'attendance.self'");
    expect(migration).toContain("'attendance.view'");
    expect(migration).not.toContain("'attendance.manage'");
  });
});
