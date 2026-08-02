import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0055_task_update_notification_overload_fix.sql', import.meta.url), 'utf8');

describe('task update notifications', () => {
  it('uses the extended notify_user signature with explicit text casts', () => {
    expect(migration).toContain('create or replace function public.notify_task_update()');
    expect(migration).toContain("'Task updated'::text");
    expect(migration).toContain("'/admin/tasks'::text");
    expect(migration).toContain("'tasks'::text");
    expect(migration).toContain("'medium'::text");
    expect(migration).toContain("'standard'::text");
  });
});
