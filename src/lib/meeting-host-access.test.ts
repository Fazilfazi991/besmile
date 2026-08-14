import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260815090000_grant_diya_meeting_host_access.sql'), 'utf8');
const meetingMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260811051945_personal_calendar_and_meetings.sql'), 'utf8');

describe('meeting host access', () => {
  it('keeps creation server-enforced through the established permission check', () => {
    expect(meetingMigration).toContain("public.has_permission('meetings.create') or public.has_permission('meetings.manage')");
  });

  it('grants the approved active Diya account only the meeting creation permission', () => {
    expect(migration).toContain("lower(profile.email) = 'diyaassistantmanager@gmail.com'");
    expect(migration).toContain("permission.code = 'meetings.create'");
    expect(migration).toContain("profile.status = 'active'");
    expect(migration).toContain('grant_row.revoked_at is null');
  });
});
