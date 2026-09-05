import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync('src/app/employee/attendance/page.tsx', 'utf8');
const adminRoute = readFileSync('src/app/admin/my-attendance/page.tsx', 'utf8');
const repository = readFileSync('src/lib/employee-repository.ts', 'utf8');

describe('personal attendance workspace', () => {
  it('keeps the existing admin route and user-scoped query', () => {
    expect(adminRoute).toContain("@/app/employee/attendance/page");
    expect(page).toContain('attendanceRules(employee.id, range.from, range.to)');
    expect(page).toContain('attendanceToday(employee.id)');
    expect(repository).toContain('.eq("profile_id", userId)');
  });

  it('provides period, real-status, record and pagination controls', () => {
    expect(page).toContain("['last-7', 'Last 7 Days']");
    expect(page).toContain("['month', 'This Month']");
    expect(page).toContain("['custom', 'Custom']");
    expect(page).toContain("present: 'Present', late: 'Late', absent: 'Absent', leave: 'Leave', holiday: 'Holiday', weekend: 'Weekly Off'");
    expect(page).toContain('pageSizeOptions={PAGE_SIZES}');
    expect(page).toContain('<th>Date</th><th>Shift</th><th>Actual In</th><th>Actual Out</th><th>Work Hours</th><th>Status</th>');
  });

  it('uses the production canonical attendance calculation and does not add correction behavior', () => {
    expect(page).toContain('minutes(day.row)');
    expect(page).not.toMatch(/regulari[sz]|correction request/i);
  });
});
