import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819130000_assistant_manager_meeting_host_access.sql'),
  'utf8',
);

describe('Assistant Manager meeting host access migration', () => {
  it('grants only the canonical host capability through the Staff designation mapping', () => {
    expect(migration).toContain("permission.code = 'meetings.host'");
    expect(migration).toContain("assistant.role::text = 'staff'");
    expect(migration).toContain("assistant.designation = 'Assistant Manager'");
    expect(migration).toContain("assistant.status::text in ('active', 'intern', 'probation')");
  });

  it('does not grant broad meeting management or hardcode a person', () => {
    for (const forbidden of ['meetings.manage', 'Diya', 'Anthikat']) {
      expect(migration).not.toContain(forbidden);
    }
  });
});


