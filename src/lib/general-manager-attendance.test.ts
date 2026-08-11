import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260807231500_general_manager_self_attendance.sql', import.meta.url), 'utf8');
const attendanceFoundation = readFileSync(new URL('../../supabase/migrations/0001_bsmile_auth_foundation.sql', import.meta.url), 'utf8');

describe('General Manager attendance', () => {
  it('uses the shared employee attendance actions in the management dashboard', () => {
    expect(dashboard).toContain('employeeRepository.attendanceToday(signedInProfile.id)');
    expect(dashboard).toContain('employeeRepository.clockIn(profile.id, await freshLocation())');
    expect(dashboard).toContain('employeeRepository.startBreak(todayAttendance.id)');
    expect(dashboard).toContain('employeeRepository.endBreak(activeBreak.id)');
    expect(dashboard).toContain('employeeRepository.clockOut(todayAttendance.id, await freshLocation())');
    expect(dashboard).toContain('Attendance update could not be confirmed.');
  });

  it('uses the company timezone for both self-attendance and dashboard totals', () => {
    const employeeRepository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');
    const adminRepository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
    expect(employeeRepository).toContain('async attendanceToday(userId:string)');
    expect(employeeRepository).toContain("const workDate=dateKey(new Date(),settings.timezone)");
    expect(adminRepository).toContain("const today=dateKey(new Date(),settings.timezone)");
  });

  it('uses the geofenced RPC insert so duplicate clock-ins cannot overwrite the first timestamp', () => {
    const employeeRepository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');
    expect(employeeRepository).toContain("rpc('record_self_attendance_location'");
    expect(attendanceFoundation).toContain('unique(profile_id,work_date)');
    expect(employeeRepository).toContain('You have already clocked in today.');
  });

  it('grants GM self-service and company attendance visibility without attendance management authority', () => {
    expect(migration).toContain("'attendance.self'");
    expect(migration).toContain("'attendance.view'");
    expect(migration).not.toContain("'attendance.manage'");
  });

  it('reuses the personal attendance page for GM while scoping every history query to the signed-in profile', () => {
    const route = readFileSync(new URL('../app/admin/my-attendance/page.tsx', import.meta.url), 'utf8');
    const employeeRepository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');
    expect(route).toContain("export { default } from '@/app/employee/attendance/page'");
    expect(employeeRepository).toContain(".eq('profile_id',userId).order('work_date'");
    expect(employeeRepository).toContain(".eq('profile_id',userId).eq('work_date',workDate)");
  });
});
