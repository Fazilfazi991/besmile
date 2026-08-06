import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0088_doctor_management_profile_fields.sql'), 'utf8');

describe('doctor management profile migration', () => {
  it('adds optional contact data and archive fields without weakening RLS', () => {
    expect(migration).toContain('add column if not exists email text');
    expect(migration).toContain('add column if not exists archived_at timestamptz');
    expect(migration).toContain('add column if not exists archived_by uuid references public.profiles');
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration).not.toContain('using (true)');
  });
});
