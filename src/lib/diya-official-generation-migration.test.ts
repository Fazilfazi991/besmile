import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260923202346_restore_diya_official_generation.sql', 'utf8');
const diyaId = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5';

async function fixture(designation: string) {
  const db = new PGlite();
  await db.exec(`
    create table public.departments(id uuid primary key, name text not null);
    create table public.profiles(id uuid primary key, full_name text, role text, status text, designation text, department_id uuid);
    create table public.permissions(id uuid primary key, code text unique);
    create table public.user_permission_grants(profile_id uuid, permission_id uuid, reason text,
      starts_at timestamptz default now(), expires_at timestamptz, revoked_at timestamptz);
    insert into public.departments values ('10000000-0000-4000-8000-000000000001', 'Administration');
    insert into public.permissions values
      ('20000000-0000-4000-8000-000000000001', 'documents.official.generate'),
      ('20000000-0000-4000-8000-000000000002', 'documents.manage');
  `);
  await db.query('insert into public.profiles values ($1,$2,$3,$4,$5,$6)',
    [diyaId, 'Diya Anthikat', 'staff', 'active', designation, '10000000-0000-4000-8000-000000000001']);
  return db;
}

describe('Diya generation restore migration', () => {
  it('grants only generation to the verified current account and is idempotent', async () => {
    const db = await fixture('Admin ');
    try {
      await db.exec(migration);
      await db.exec(migration);
      const result = await db.query<{ code: string }>(`select permission.code from public.user_permission_grants grant_row
        join public.permissions permission on permission.id = grant_row.permission_id`);
      expect(result.rows).toEqual([{ code: 'documents.official.generate' }]);
    } finally { await db.close(); }
  }, 30_000);

  it('stops when the account identity or designation has changed', async () => {
    const db = await fixture('Assistant Manager');
    try { await expect(db.exec(migration)).rejects.toThrow('Diya official generation identity check failed'); }
    finally { await db.close(); }
  }, 30_000);
});
