import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260818161000_guard_clinician_lifecycle_status.sql'), 'utf8');

describe('clinician lifecycle status guard', () => {
  it('rejects direct status changes so they cannot bypass upcoming appointment checks', () => {
    expect(migration).toContain('new.status is distinct from old.status');
    expect(migration).toContain("current_setting('app.clinician_lifecycle', true)");
  });
});
