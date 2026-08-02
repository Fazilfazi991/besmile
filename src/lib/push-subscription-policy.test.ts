import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0061_push_subscription_own_user_policy.sql', import.meta.url), 'utf8');

describe('push subscription RLS policy migration', () => {
  it('requires every browser push operation to stay on auth.uid()', () => {
    expect(migration).toContain('alter table public.push_subscriptions enable row level security');
    expect(migration).toContain('for select');
    expect(migration).toContain('for insert');
    expect(migration).toContain('for update');
    expect(migration).toContain('for delete');
    expect(migration.match(/user_id = auth\.uid\(\)/g)).toHaveLength(5);
  });
});
