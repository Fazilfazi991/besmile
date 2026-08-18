import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const rules = readFileSync(resolve(root, 'src/lib/attendance-rules.ts'), 'utf8');
const attendancePage = readFileSync(resolve(root, 'src/app/employee/attendance/page.tsx'), 'utf8');
const staffAttendance = readFileSync(resolve(root, 'src/app/admin/attendance/page.tsx'), 'utf8');
const dashboard = readFileSync(resolve(root, 'src/app/employee/dashboard/page.tsx'), 'utf8');

describe('attendance duration regression', () => {
  it('limits live elapsed time to the current Asia/Kolkata business date', () => {
    expect(rules).toContain("timeZone='Asia/Kolkata'");
    expect(rules).toContain("workDate===dateKey(now,timeZone)");
    expect(rules).toContain('isIncomplete:true');
    expect(rules).not.toContain("const end=row.clock_out?new Date(row.clock_out).getTime():Date.now()");
  });

  it('uses the canonical result in employee history, staff attendance, and the dashboard', () => {
    expect(attendancePage).toContain('attendanceDuration');
    expect(attendancePage).toContain('Missing clock-out');
    expect(staffAttendance).toContain('attendanceDuration');
    expect(staffAttendance).toContain('Missing clock-out');
    expect(dashboard).toContain('attendanceDuration');
    expect(dashboard).not.toContain('const end = attendance.clock_out');
  });
});
