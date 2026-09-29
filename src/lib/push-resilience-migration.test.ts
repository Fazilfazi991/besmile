import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260929035324_release_2_push_resilience.sql', import.meta.url), 'utf8');
const historicalMigration = readFileSync(new URL('../../supabase/migrations/20260925093947_rotate_push_dispatch_secret_to_vault.sql', import.meta.url), 'utf8');

describe('Release 2 browser-push resilience migration', () => {
  it('changes push behavior only through a new forward migration', () => {
    expect(migration).toContain('create or replace function private.dispatch_browser_push()');
    expect(migration).toContain('after insert on public.notifications');
    expect(historicalMigration).toContain("raise exception 'Push dispatch configuration is missing'");
  });

  it('treats absent or partial Vault configuration as optional delivery', () => {
    expect(migration).toContain("name = 'bsmile_push_dispatch_secret'");
    expect(migration).toContain("name = 'bsmile_push_dispatch_url'");
    expect(migration).toContain("nullif(pg_catalog.btrim(dispatch_secret), '') is null");
    expect(migration).toContain("nullif(pg_catalog.btrim(dispatch_url), '') is null");
    expect(migration).not.toContain('pg_catalog.nullif');
    expect(migration).toMatch(/if[\s\S]+?dispatch_secret[\s\S]+?dispatch_url[\s\S]+?return new;/);
  });

  it('contains external dispatch failures inside the trigger boundary', () => {
    expect(migration).toContain('from net.http_post(');
    expect(migration).toContain("'old_record', null");
    expect(migration).toContain("'record', pg_catalog.to_jsonb(new)");
    expect(migration).not.toMatch(/'old_record',\s*old/i);
    expect(migration).toContain('if request_id is not null then');
    expect(migration).toMatch(/begin[\s\S]+?from net\.http_post\([\s\S]+?exception\s+when others then[\s\S]+?return new;/i);
    expect(migration).not.toMatch(/create or replace function public\.(?:create_doctor_appointment|create_patient_session|record_invoice_payment)/i);
  });

  it('does not embed push credentials or expose the trigger function', () => {
    expect(migration).toContain('set search_path = pg_catalog');
    expect(migration).toContain('revoke all on function private.dispatch_browser_push()');
    expect(migration).not.toMatch(/https?:\/\//i);
    expect(migration).not.toMatch(/BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY/i);
  });
});
