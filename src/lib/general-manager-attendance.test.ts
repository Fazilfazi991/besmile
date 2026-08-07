import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260807231500_general_manager_self_attendance.sql', import.meta.url), 'utf8');

describe('General Manager attendance', () => {
  it('uses the shared employee attendance actions in the management dashboard', () => {
    expect(dashboard).toContain('employeeRepository.attendanceToday(signedInProfile.id)');
    expect(dashboard).toContain('employeeRepository.clockIn(profile.id)');
    expect(dashboard).toContain('employeeRepository.startBreak(todayAttendance.id)');
    expect(dashboard).toContain('employeeRepository.endBreak(activeBreak.id)');
    expect(dashboard).toContain('employeeRepository.clockOut(todayAttendance.id)');
    expect(dashboard).toContain('Attendance update could not be confirmed.');
  });

  it('uses the company timezone for both self-attendance and dashboard totals', () => {
    const employeeRepository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');
    const adminRepository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
    expect(employeeRepository).toContain('async attendanceToday(userId:string)');
    expect(employeeRepository).toContain("const workDate=dateKey(new Date(),settings.timezone)");
    expect(adminRepository).toContain("const today=dateKey(new Date(),settings.timezone)");
  });

  it('uses an insert instead of an upsert so duplicate clock-ins cannot overwrite the first timestamp', () => {
    const employeeRepository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');
    expect(employeeRepository).toContain(".insert({profile_id:userId,work_date:dateKey(new Date(),settings.timezone)");
    expect(employeeRepository).toContain('You have already clocked in today.');
  });

  it('grants GM self-service and company attendance visibility without attendance management authority', () => {
    expect(migration).toContain("'attendance.self'");
    expect(migration).toContain("'attendance.view'");
    expect(migration).not.toContain("'attendance.manage'");
  });
});
