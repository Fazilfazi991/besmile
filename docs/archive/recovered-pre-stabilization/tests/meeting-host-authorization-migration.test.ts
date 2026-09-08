import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819130100_meeting_host_permission_authorization.sql'),
  'utf8',
);

describe('meeting host permission authorization migration', () => {
  it('keeps active workforce and explicit host-permission checks authoritative', () => {
    for (const requirement of [
      "profile.status = 'active'",
      'profile.is_employee',
      'profile.workforce_visible',
      "public.has_permission('meetings.host', profile.id)",
    ]) expect(migration).toContain(requirement);
  });

  it('does not retain an implicit management-role restriction', () => {
    expect(migration).not.toContain("'director'");
    expect(migration).not.toContain("'general_manager'");
  });
});


