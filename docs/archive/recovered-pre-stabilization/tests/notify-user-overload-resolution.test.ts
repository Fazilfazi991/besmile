import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260815140000_notify_user_overload_resolution.sql', import.meta.url),
  'utf8',
);

describe('notify_user overload resolution', () => {
  it('keeps the rich internal overload exact-arity so seven-argument triggers are unambiguous', () => {
    expect(migration).toContain('drop function public.notify_user(uuid, text, text, text, uuid, text, uuid, text, text, text, boolean, jsonb)');
    expect(migration).toContain('notification_metadata jsonb\n)');
    expect(migration).not.toContain("notification_metadata jsonb default");
    expect(migration).not.toContain("notification_category text default");
  });

  it('retains private execution boundaries for both legacy and rich overloads', () => {
    expect(migration).toContain('revoke all on function public.notify_user(uuid, text, text, text, uuid, text, uuid) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function public.notify_user(uuid, text, text, text, uuid, text, uuid, text, text, text, boolean, jsonb) from public, anon, authenticated');
  });
});


