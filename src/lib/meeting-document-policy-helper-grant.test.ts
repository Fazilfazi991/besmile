import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20260909071902_restore_authenticated_meeting_document_policy_helper.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('meeting document policy helper grant', () => {
  it('keeps the policy helper unavailable to anonymous callers', () => {
    expect(migration).toContain(
      "revoke execute on function public.meeting_notes_editable(uuid) from public, anon",
    );
  });

  it('allows authenticated policy evaluation when the helper exists', () => {
    expect(migration).toContain(
      "to_regprocedure('public.meeting_notes_editable(uuid)') is not null",
    );
    expect(migration).toContain(
      "grant execute on function public.meeting_notes_editable(uuid) to authenticated",
    );
  });
});
