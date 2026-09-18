import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260918100000_task_parent_completion_sync.sql'), 'utf8');

describe('task parent completion synchronization', () => {
  it('keeps the canonical employee completion path and required update', () => {
    expect(migration).toContain('create or replace function public.complete_task_assignment');
    expect(migration).toContain("insert into public.task_comments(task_id, author_id, body)");
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain("where task_id = assignment.task_id and status <> 'completed'");
  });

  it('preserves multi-assignee semantics and supports legacy Production schema', () => {
    expect(migration).toContain("column_name in ('completed_at', 'completed_by')");
    expect(migration).toContain('if has_completion_metadata then');
    expect(migration).toContain('update public.tasks set status = \'completed\' where id = assignment.task_id');
    expect(migration).toMatch(/update public\.tasks t[\s\S]*not exists \([\s\S]*status <> 'completed'/);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(tasks|task_assignments|task_comments)/i);
  });
});
