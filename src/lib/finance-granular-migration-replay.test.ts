import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/0052_finance_granular_rls_access.sql',
  'utf8',
).toLowerCase();

describe('finance granular migration replay safety', () => {
  for (const policy of [
    'finance accounts granular view',
    'finance accounts granular manage',
    'finance income categories granular view',
    'finance expense categories granular view',
    'finance transactions granular read',
    'finance transactions granular insert',
    'finance transactions granular update',
  ]) {
    it(`replaces the pre-existing ${policy} policy deterministically`, () => {
      const drop = sql.indexOf(`drop policy if exists "${policy}"`);
      const create = sql.indexOf(`create policy "${policy}"`);
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(create).toBeGreaterThan(drop);
    });
  }
});
