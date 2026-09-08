import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260908061131_allow_task_creator_returning.sql'),
  'utf8',
).toLowerCase();
const repository = readFileSync(resolve(process.cwd(), 'src/lib/admin-repository.ts'), 'utf8');
const compactRepository = repository.replace(/\s+/g, '').replace(/'/g, '"');

describe('task creation RLS', () => {
  it('lets a currently authorized creator read the inserted row for RETURNING', () => {
    expect(migration).toContain('created_by = (select auth.uid())');
    expect(migration).toContain("public.has_permission('tasks.manage')");
    expect(migration).toContain("public.has_permission('tasks.assign')");
    expect(migration).toContain('public.task_visible_to_current_user(id)');
  });

  it('keeps anonymous and unauthorized creators blocked', () => {
    expect(migration).toContain('to authenticated');
    expect(migration).not.toMatch(/to\s+anon/);
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(migration).not.toMatch(/grant\s+.*authenticated/);
  });

  it('records the authenticated creator and links selected assignees after insert', () => {
    expect(compactRepository).toContain('created_by:payload.created_by');
    expect(compactRepository).toContain('.from("tasks").insert(');
    expect(compactRepository).toContain('.from("task_assignments").insert(');
    expect(compactRepository).toContain('task_id:data.id,profile_id,status:"todo"');
  });
});
