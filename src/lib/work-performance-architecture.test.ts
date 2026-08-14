import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260814170000_work_performance_management_visibility.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/admin/work-performance/page.tsx', import.meta.url), 'utf8');

describe('work-performance architecture', () => {
  it('uses a permission-gated, batched summary over canonical sources', () => {
    expect(migration).toContain("'work_performance.view'");
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('public.task_assignments');
    expect(migration).toContain('public.attendance');
    expect(migration).toContain('public.leave_requests');
    expect(migration).toContain("profile.workforce_visible");
    expect(migration).toContain("profile.status::text = 'active'");
  });

  it('keeps date-only due logic and documents unsupported performance claims', () => {
    expect(migration).toContain("task.due_date = business_day");
    expect(migration).toContain("task.due_date < business_day");
    expect(page).toContain('does not calculate on-time completion rates');
    expect(page).toContain('not historical reassignment attribution');
    expect(page).toContain('Attendance not recorded');
  });
});
