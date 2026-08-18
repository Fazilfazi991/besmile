import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canEditMeeting } from './meeting-form-state';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260818140817_grant_assistant_manager_meeting_create.sql'), 'utf8');
const meetingsPage = readFileSync(resolve(process.cwd(), 'src/app/employee/meetings/page.tsx'), 'utf8');
const repository = readFileSync(resolve(process.cwd(), 'src/lib/calendar-meeting-repository.ts'), 'utf8');

describe('Assistant Manager meeting creation', () => {
  it('grants Diya through the existing direct-permission architecture without a name check', () => {
    expect(migration).toContain("permission.code = 'meetings.create'");
    expect(migration).toContain("assistant_manager.designation = 'Assistant Manager'");
    expect(migration).toContain('user_permission_grants');
    expect(migration).not.toContain('Diya Anthikat');
  });

  it('uses the same permissions for the visible action and protected RPC', () => {
    expect(meetingsPage).toContain("perms['meetings.create'] || perms['meetings.manage']");
    expect(repository).toContain(".rpc('save_meeting'");
    expect(canEditMeeting({ 'meetings.create': true }, { organizer_id: 'diya-profile' }, 'diya-profile')).toBe(true);
    expect(canEditMeeting({ 'meetings.create': true }, { organizer_id: 'another-profile' }, 'diya-profile')).toBe(false);
  });
});
