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
    expect(page).toContain("half_day: 'Half Day', regularized: 'Regularized'");
    expect(page).toContain('pageSizeOptions={PAGE_SIZES}');
    expect(page).toContain('<th>Date</th><th>Punch In</th><th>Punch Out</th><th>Total Working Hours</th><th>Status</th><th>Action</th>');
  });

  it('uses the canonical duration calculation and an auditable regularization request', () => {
    expect(page).toContain('attendanceDuration(day.row');
    expect(page).toContain('requestAttendanceRegularization');
    expect(page).toContain('Your original punch data will remain unchanged.');
  });
});
