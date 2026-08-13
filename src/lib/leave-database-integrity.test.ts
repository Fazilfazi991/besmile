import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260813075816_leave_integrity_and_notification_actor.sql'), 'utf8');
const repository = readFileSync(resolve(process.cwd(), 'src/lib/admin-repository.ts'), 'utf8');

describe('leave database integrity and decision attribution', () => {
  it('rejects active overlapping ranges inside a trusted database trigger', () => {
    expect(migration).toContain('before insert or update of profile_id, starts_on, ends_on, status');
    expect(migration).toContain("existing.status in ('pending', 'approved')");
    expect(migration).toContain("daterange(existing.starts_on, existing.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')");
    expect(migration).toContain("errcode = '23P01'");
  });

  it('records and notifies with the actual reviewer identity', () => {
    expect(repository).toContain('approver_id:reviewerId');
    expect(repository).toContain('reviewed_by:reviewerId');
    expect(migration).toContain('coalesce(new.reviewed_by,new.approver_id)');
  });

  it('notifies only active operational managers about new requests', () => {
    expect(migration).toContain("status = 'active'");
    expect(migration).toContain('and workforce_visible');
  });
});
