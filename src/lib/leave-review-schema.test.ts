import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/0056_leave_review_columns_and_event_policy.sql', import.meta.url),
  'utf8',
);

describe('leave review schema migration', () => {
  it('adds review metadata columns used by the approval workflow', () => {
    expect(migration).toContain('add column if not exists reviewed_by');
    expect(migration).toContain('add column if not exists reviewed_at');
  });

  it('allows authorized leave reviewers to record approval events', () => {
    expect(migration).toContain('leave events authorized insert');
    expect(migration).toContain('public.leave_employee_can_manage(request.profile_id)');
  });
});
