import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260818145748_guard-meeting-document-policy-helper.sql',
  'utf8',
);

describe('meeting document policy helper migration', () => {
  it('grants only when the legacy helper exists', () => {
    expect(migration).toContain("to_regprocedure('public.meeting_notes_editable(uuid)') is not null");
    expect(migration).toContain("execute 'grant execute on function public.meeting_notes_editable(uuid) to authenticated'");
    expect(migration).not.toMatch(/^grant execute/m);
  });
});
