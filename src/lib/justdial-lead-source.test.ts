import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260810210000_add_justdial_lead_source.sql'), 'utf8');

describe('Justdial lead source', () => {
  it('adds the canonical display value idempotently', () => {
    expect(migration).toContain("values ('Justdial')");
    expect(migration).toContain('on conflict (name) do nothing');
  });
});
