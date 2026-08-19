import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canEditMeeting } from './meeting-form-state';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260819100000_assistant_manager_meeting_create_and_task_delete.sql'), 'utf8');
const meetingsPage = readFileSync(resolve(process.cwd(), 'src/app/employee/meetings/page.tsx'), 'utf8');
const repository = readFileSync(resolve(process.cwd(), 'src/lib/calendar-meeting-repository.ts'), 'utf8');

describe('Assistant Manager meeting creation', () => {
  it('grants Assistant Managers through the existing direct-permission architecture without a user check', () => {
    expect(migration).toContain("permission.code = 'meetings.create'");
    expect(migration).toContain("assistant.designation = 'Assistant Manager'");
    expect(migration).toContain('user_permission_grants');
    expect(migration).not.toContain('Diya Anthikat');
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('uses the existing task-management capability without widening access to Staff', () => {
    expect(migration).toContain("'tasks.assign'");
    expect(migration).toContain("assistant.designation = 'Assistant Manager'");
    expect(migration).not.toContain("'tasks.manage'");
    expect(migration).not.toContain("permission.code = 'tasks.manage_access'");
  });

  it('uses the same permissions for the visible action and protected RPC', () => {
    expect(meetingsPage).toContain("perms['meetings.create'] || perms['meetings.manage']");
    expect(repository).toContain(".rpc('save_meeting'");
    expect(canEditMeeting({ 'meetings.create': true }, { organizer_id: 'diya-profile' }, 'diya-profile')).toBe(true);
    expect(canEditMeeting({ 'meetings.create': true }, { organizer_id: 'another-profile' }, 'diya-profile')).toBe(false);
  });
});
