import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260904093036_secure_legacy_clients_and_enquiries.sql',
  'utf8',
).toLowerCase();

describe('legacy client and enquiry security boundary', () => {
  for (const table of ['clients', 'enquiries']) {
    it(`enables RLS and removes API table privileges for ${table}`, () => {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all privileges on table public.${table} from anon, authenticated`);
    });

    it(`installs an explicit restrictive deny policy for ${table}`, () => {
      expect(sql).toMatch(new RegExp(`create policy "legacy ${table} are internal only"[\\s\\S]*?on public\\.${table}[\\s\\S]*?as restrictive[\\s\\S]*?to anon, authenticated[\\s\\S]*?using \\(false\\)[\\s\\S]*?with check \\(false\\)`));
    });
  }

  it('fails clearly when legacy tables or required columns are absent', () => {
    expect(sql).toContain("to_regclass('public.clients') is null");
    expect(sql).toContain("to_regclass('public.enquiries') is null");
    expect(sql).toContain('legacy table contract mismatch; missing columns');
  });

  it('does not create active tables or grant API access', () => {
    expect(sql).not.toMatch(/create\s+table/);
    expect(sql).not.toMatch(/grant\s+.+\s+to\s+(anon|authenticated)/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/with\s+check\s*\(\s*true\s*\)/);
  });
});
