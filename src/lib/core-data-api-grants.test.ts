import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260908014111_restore_core_data_api_grants.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('core Data API grants', () => {
  it('requires RLS before restoring foundational table access', () => {
    expect(migration).toContain('relation.relrowsecurity');
    expect(migration).toContain('refusing data api grant');
  });

  it('restores authenticated profile and task access without anonymous DML', () => {
    expect(migration).toContain('grant select on table');
    expect(migration).toContain('public.profiles');
    expect(migration).toContain('public.tasks');
    expect(migration).toContain('to authenticated');
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all privileges)[\s\S]*?to\s+anon/);
  });

  it('keeps direct profile deletion revoked', () => {
    expect(migration).toContain('revoke delete on table public.profiles from authenticated, anon');
  });
});
