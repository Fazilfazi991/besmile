import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { employeeNavigation, employeeRouteRequirement, filterNavigation, permissionAllows } from './permission-access';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260815100000_grant_chat_and_meetings_visibility.sql'), 'utf8');
const meetingMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260811051945_personal_calendar_and_meetings.sql'), 'utf8');

describe('communication and meeting access', () => {
  it('keeps Chat and Meetings in the employee navigation for every active employee role', () => {
    const labels = filterNavigation(employeeNavigation, new Set()).flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toEqual(expect.arrayContaining(['Chat', 'Meetings']));
    expect(employeeRouteRequirement('/employee/chat')).toBeUndefined();
    expect(employeeRouteRequirement('/employee/meetings')).toBeUndefined();
  });

  it('grants role visibility without granting meeting creation', () => {
    expect(migration).toContain("permission.code in ('chat.use', 'meetings.view')");
    expect(migration).not.toContain("'meetings.create'");
    expect(migration).not.toContain("'meetings.manage'");
    expect(permissionAllows(new Set(['meetings.view']), employeeRouteRequirement('/employee/meetings'))).toBe(true);
  });

  it('keeps meeting creation enforced by the server-side permission check', () => {
    expect(meetingMigration).toContain("public.has_permission('meetings.create') or public.has_permission('meetings.manage')");
  });
});
