import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../supabase/release/october_support_verified_staff_grants.sql', import.meta.url), 'utf8');

describe('October support release-only grants', () => {
  it('preserves existing grants, is retry-safe and fails closed on an identity mismatch', async () => {
    const db = new PGlite();
    try {
      await db.exec(`create schema auth;
        create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
        create table public.profiles(id uuid primary key,full_name text,email text,designation text,status text,is_employee boolean,workforce_visible boolean,login_enabled boolean,onboarding_required boolean,removed_at timestamptz);
        create table public.permissions(id uuid primary key default gen_random_uuid(),code text unique not null);
        create table public.user_permission_grants(id uuid primary key default gen_random_uuid(),profile_id uuid not null,permission_id uuid not null,reason text,starts_at timestamptz default now(),expires_at timestamptz,revoked_at timestamptz);
        insert into profiles values
         ('04f7ade2-99ee-43d1-b4c0-de2cd168fc39','Fatima Suhara','salesheadbsmile@gmail.com','Sales Coordinator','active',true,true,true,false,null),
         ('28516281-ec1c-4902-a786-346e1a51f001','Fatima KR','marketingcobsmile@gmail.com','Sales  Coordinator','active',true,true,true,false,null),
         ('ccb736c8-de18-4dec-9b18-cda4c3fdd1b5','Diya Anthikat','diyaassistantmanager@gmail.com','Admin / Social Worker','active',true,true,true,false,null);
        insert into auth.users(id,email,email_confirmed_at) select id,email,now() from profiles;
        insert into permissions(code) values ('leave.request'),('leads.edit'),('sales.edit'),('leads.convert_to_patient'),('patients.create');
        insert into user_permission_grants(profile_id,permission_id,reason) select 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5',id,'existing authorization' from permissions where code='sales.edit';`);
      await db.exec(sql);
      await db.exec(sql);
      const grants = await db.query<{ profile_id: string; code: string; reason: string }>(`select g.profile_id,p.code,g.reason from user_permission_grants g join permissions p on p.id=g.permission_id`);
      expect(grants.rows).toHaveLength(9);
      expect(grants.rows.filter(g => g.reason === 'existing authorization')).toHaveLength(1);
      expect(grants.rows.filter(g => g.profile_id === '28516281-ec1c-4902-a786-346e1a51f001').map(g => g.code).sort()).toEqual(['leads.convert_to_patient', 'leave.request', 'patients.create']);
      expect(grants.rows.every(g => !['finance.manage','employees.manage','invoices.manage'].includes(g.code))).toBe(true);
      await db.exec(`update auth.users set banned_until=now()+interval '1 day' where id='28516281-ec1c-4902-a786-346e1a51f001'`);
      await expect(db.exec(sql)).rejects.toThrow('All three intended operational staff identities');
      await db.exec('rollback');
      const count = await db.query<{ count: number }>('select count(*)::int as count from user_permission_grants');
      expect(count.rows[0].count).toBe(9);
    } finally { await db.close(); }
  }, 30_000);
});
