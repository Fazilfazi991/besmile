import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
let db: PGlite;
const manager = '10000000-0000-4000-8000-000000000001', external = '10000000-0000-4000-8000-000000000002', broad = '10000000-0000-4000-8000-000000000003';
const doctor = '20000000-0000-4000-8000-000000000001';
const original = readFileSync('supabase/migrations/20261005184636_outsourced_clinician_access.sql','utf8');
const fn = (name: string) => original.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))![0];
async function asUser(id: string) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); }
async function replace(ranges: unknown) { return db.query('select * from public.replace_clinician_availability($1,$2::jsonb)', [doctor, JSON.stringify(ranges)]); }
const range = (day: number, start='13:30', end='01:00') => ({ day_of_week:day, start_time:start, end_time:end });
async function available(start: string, end: string) { return (await db.query<{ok:boolean}>('select public.doctor_slot_is_available($1,$2,$3) ok',[doctor,start,end])).rows[0].ok; }
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema clinician_private; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz);
    create table public.profiles(id uuid primary key,is_employee boolean,status text default 'active',login_enabled boolean default true,onboarding_required boolean default false,
      full_name text,phone text,personal_email text,avatar_url text);
    create table public.permissions(id uuid primary key default gen_random_uuid(),code text);
    create table public.user_permission_grants(profile_id uuid,permission_id uuid,starts_at timestamptz default now(),expires_at timestamptz,revoked_at timestamptz);
    create table public.outsourced_doctors(id uuid primary key,profile_id uuid,clinician_type text,status text default 'active',archived_at timestamptz,self_service_enabled boolean default true,
      consultation_duration_minutes int default 30,doctor_name text,phone text,qualification text,specialization text,professional_information text,updated_by uuid);
    create table public.doctor_weekly_availability(id uuid default gen_random_uuid(),doctor_id uuid,day_of_week int not null check(day_of_week between 0 and 6),start_time time not null,end_time time not null,created_by uuid,
      constraint doctor_weekly_availability_check check(start_time < end_time));
    create table public.doctor_blocked_periods(doctor_id uuid,blocked_date date,start_time time,end_time time,
      check((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time<end_time)));
    create table public.doctor_appointments(id uuid default gen_random_uuid(),doctor_id uuid,start_at timestamptz,end_at timestamptz,status text,deleted_at timestamptz);
    create table public.audit_logs(actor_id uuid,action text,entity_type text,entity_id uuid,before_data jsonb,after_data jsonb);
    create table storage.objects(bucket_id text,name text,owner_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    create function clinician_private.internal_has_permission(text,uuid) returns boolean language sql stable as $$select $2='${broad}'::uuid$$;
    create function clinician_private.internal_can_manage_clinician(uuid) returns boolean language sql stable as $$select auth.uid()='${broad}'::uuid$$;
    create function public.business_timezone() returns text language sql immutable as $$select 'Asia/Kolkata'::text$$;
    create function public.notify_user(uuid,text,text,text,uuid,text,uuid,text,text,text,boolean,jsonb) returns void language sql as $$select$$;
    grant usage on schema public,auth,storage to authenticated; grant all on all tables in schema public,storage to authenticated;
    insert into profiles(id,is_employee,full_name) values('${manager}',true,'QA Manager'),('${external}',false,'QA External'),('${broad}',true,'QA Broad');
    insert into auth.users values('${external}',now(),null);
    insert into outsourced_doctors(id,profile_id,clinician_type,doctor_name) values('${doctor}','${external}','outsourced','QA Clinician');
    insert into permissions(code) values('outsourced_clinicians.manage'),('clinician.workspace'),('clinician.profile.edit');
    insert into user_permission_grants(profile_id,permission_id) select '${manager}',id from permissions where code='outsourced_clinicians.manage';
    insert into user_permission_grants(profile_id,permission_id) select '${external}',id from permissions;
  `);
  for (const name of ['is_external_profile','active_direct_permission','external_clinician_eligible','has_permission','current_clinician_id','can_manage_clinician','save_clinician_profile']) await db.exec(fn(name));
  await db.exec(readFileSync('supabase/migrations/20261006074106_clinician_overnight_availability.sql','utf8'));
  await db.exec(`alter table storage.objects enable row level security;
    create policy "profile photo upload" on storage.objects for insert to authenticated with check(bucket_id='profile-photos' and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text);`);
  await db.exec(original.match(/create policy "scoped clinician manager photo upload"[\s\S]*?;/)![0]);
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => { await db.exec('reset role; delete from doctor_weekly_availability; delete from doctor_appointments; delete from doctor_blocked_periods; delete from storage.objects;'); await asUser(manager); });
describe('migrated PostgreSQL overnight rules with existing manager and photo scopes', () => {
  it.each([range(1,'09:00','17:00'),range(1),range(6,'13:00','03:00')])('accepts range %j', async value => { expect((await replace([value])).rows).toHaveLength(1); });
  it.each([range(1,'09:00','09:00'),range(8),range(1,'24:00','01:00'),range(1,'23:50','00:00'),{day_of_week:1}])('rejects invalid range %j atomically', async value => { await replace([range(1)]); await expect(replace([value])).rejects.toThrow(); expect((await db.query('select * from doctor_weekly_availability')).rows).toHaveLength(1); });
  it.each([[1,2],[6,0],[0,1]])('checks overlap across day %s → %s with boundary adjacency', async (day,next) => { await expect(replace([range(day,'20:00','02:00'),range(next,'01:00','04:00')])).rejects.toThrow(/overlap/); expect((await replace([range(day,'20:00','02:00'),range(next,'02:00','04:00')])).rows).toHaveLength(2); });
  it.each([['2027-01-05',1],['2027-01-03',6],['2027-01-04',0]] as const)('qualifies inherited slots on %s', async (date,day) => { await replace([range(day)]); expect(await available(`${date}T00:30:00+05:30`,`${date}T01:00:00+05:30`)).toBe(true); expect(await available(`${date}T01:00:00+05:30`,`${date}T01:30:00+05:30`)).toBe(false); });
  it('requires complete date-time containment and honors next-day blocks', async () => { await replace([range(1,'23:45','00:30')]); expect(await available('2027-01-04T23:45:00+05:30','2027-01-05T00:15:00+05:30')).toBe(true); await db.query('insert into doctor_blocked_periods values($1,$2,null,null)',[doctor,'2027-01-05']); expect(await available('2027-01-04T23:45:00+05:30','2027-01-05T00:15:00+05:30')).toBe(false); });
  it('does not widen same-day or blocked-period semantics', async () => { await replace([range(1,'09:00','17:00')]); expect(await available('2027-01-04T16:30:00+05:30','2027-01-05T10:00:00+05:30')).toBe(false); await expect(db.query('insert into doctor_blocked_periods values($1,$2,$3,$4)',[doctor,'2027-01-04','23:00','01:00'])).rejects.toThrow(/check constraint/); });
  it('preserves existing PostgreSQL midnight endpoints', async () => { await replace([range(1,'23:00','24:00')]); expect(await available('2027-01-04T23:30:00+05:30','2027-01-05T00:00:00+05:30')).toBe(true); });
  it.each(['scheduled','confirmed','completed','rescheduled','no_show','cancelled'])('retains %s appointment overlap behavior', async status => { await replace([range(1)]); await db.query('insert into doctor_appointments(doctor_id,start_at,end_at,status) values($1,$2,$3,$4)',[doctor,'2027-01-04T23:50:00+05:30','2027-01-05T00:45:00+05:30',status]); expect(await available('2027-01-05T00:30:00+05:30','2027-01-05T01:00:00+05:30')).toBe(status==='cancelled'); });
  it('external identity cannot gain manager availability access even with a direct manager grant', async () => { await asUser(external); await expect(replace([range(1)])).rejects.toThrow(/Permission denied/); });
  it('broad internal doctor manager remains denied for outsourced targets', async () => { await asUser(broad); await expect(replace([range(1)])).rejects.toThrow(/Permission denied/); });
  it('text-only profile saves retain the avatar and accept unlinked registry profiles', async () => { await db.exec('reset role'); await db.query('update profiles set avatar_url=$1 where id=$2',[`${external}/existing.jpg`,external]); await asUser(manager); await db.query('select save_clinician_profile($1,$2::jsonb)',[doctor,JSON.stringify({full_name:'QA Updated',qualification:'QA MSc',professional_information:'QA Info'})]); expect((await db.query<{avatar_url:string}>('select avatar_url from profiles where id=$1',[external])).rows[0].avatar_url).toBe(`${external}/existing.jpg`); await db.exec('reset role'); await db.query('update outsourced_doctors set profile_id=null where id=$1',[doctor]); await asUser(manager); await db.query('select save_clinician_profile($1,$2::jsonb)',[doctor,JSON.stringify({phone:'QA 000000'})]); await db.exec('reset role'); await db.query('update outsourced_doctors set profile_id=$1 where id=$2',[external,doctor]); });
  it('external upload to another clinician folder is denied; scoped manager upload/profile update succeeds', async () => { await asUser(external); await expect(db.query('insert into storage.objects values($1,$2,$3)',['profile-photos',`${manager}/bad.jpg`,external])).rejects.toThrow(/row-level security/); await asUser(manager); const path=`${external}/new.jpg`; await db.query('insert into storage.objects values($1,$2,$3)',['profile-photos',path,manager]); await db.query('select save_clinician_profile($1,$2::jsonb)',[doctor,JSON.stringify({avatar_url:path})]); expect((await db.query<{avatar_url:string}>('select avatar_url from profiles where id=$1',[external])).rows[0].avatar_url).toBe(path); });
});
