import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260806163949_counselling_feedback_foundation.sql'), 'utf8');

describe('counselling feedback foundation migration', () => {
  it('keeps responses idempotent and validates imported numeric fields', () => {
    expect(migration).toContain('constraint counselling_feedback_responses_source_response_unique unique (source_id, external_response_key)');
    expect(migration).toContain("rating integer check (rating is null or rating between 1 and 5)");
    expect(migration).toContain('session_count integer check (session_count is null or session_count >= 0)');
  });

  it('allows approved management feedback viewers but has no regular-staff path', () => {
    expect(migration).toContain("public.has_permission('customer_feedback.view')");
    expect(migration).not.toContain("public.current_role() = 'staff'");
  });

  it('limits psychologists to their own matched responses', () => {
    expect(migration).toContain("public.current_role() = 'psychologist' and psychologist_profile_id = (select auth.uid()) and match_status = 'matched'");
    expect(migration).not.toContain("or (public.current_role() = 'psychologist' and psychologist_profile_id = (select auth.uid()))");
  });

  it('keeps source configuration and sync history behind the management permission', () => {
    expect(migration).toContain("values ('counselling_feedback.manage'");
    expect(migration).toContain("public.has_permission('counselling_feedback.manage')");
    expect(migration).toContain('counselling_feedback_sync_runs');
  });

  it('uses complete updated-at trigger declarations', () => {
    for (const table of ['sources', 'responses', 'staff_mappings']) {
      expect(migration).toMatch(
        new RegExp(`before update on public\\.counselling_feedback_${table}\\s+for each row execute function public\\.touch_updated_at\\(\\);`),
      );
    }
  });

  it('does not grant psychologists access to raw response payloads', () => {
    expect(migration).toContain('revoke all on table public.counselling_feedback_responses from anon, authenticated');
    expect(migration).toContain('grant select (');
    expect(migration).not.toContain('raw_payload\n) on public.counselling_feedback_responses to authenticated');
  });
});
