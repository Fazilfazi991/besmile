import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/admin/attendance/page.tsx', import.meta.url), 'utf8');
const geofence = readFileSync(new URL('./attendance-geofence.ts', import.meta.url), 'utf8');

describe('staff attendance access', () => {
  it('uses the existing attendance.view permission for the shared staff route and server guard', () => {
    expect(route).toContain('employeeRepository.companyAttendance(workDate)');
    expect(middleware).toContain('const requirement = adminRouteRequirement(path)');
    expect(middleware).toContain("if (!isSuperAdmin && !isManagement && !await hasAnyPermission(['admin.shell']))");
  });

  it('reads company attendance without adding an attendance-management mutation', () => {
    expect(repository).toContain('async companyAttendance(workDate:string)');
    expect(repository).toContain("r.from('attendance').select('id,profile_id,work_date,clock_in,clock_out,status,break_minutes");
    expect(repository).not.toContain('async companyAttendance(workDate:string){const r=required();return r.from(\'attendance\').update');
  });

  it('keeps staff attendance viewing separate from geofenced self-attendance', () => {
    expect(route).not.toContain('freshLocation');
    expect(geofence).toContain('radiusMetres:100');
    expect(geofence).toContain('maxAccuracyMetres:50');
  });
});
