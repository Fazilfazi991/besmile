import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261006145005_clinician_temporary_credentials_and_organization_people.sql', 'utf8');
const fn = (name: string) => migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))![0];
const manager='10000000-0000-4000-8000-000000000001', staff='10000000-0000-4000-8000-000000000002', external='10000000-0000-4000-8000-000000000003', doctor='20000000-0000-4000-8000-000000000001';
let db: PGlite;
async function asUser(id: string, role='authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]); await db.exec(`set role ${role}`); }
async function status() { return (await db.query<{status:string}>('select public.clinician_temporary_credential_status($1) status',[doctor])).rows[0].status; }
beforeAll(async () => {
 db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema clinician_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table public.profiles(id uuid primary key,full_name text,designation text,manager_id uuid,department_id uuid,avatar_url text,status text default 'active',is_employee boolean,workforce_visible boolean default true,login_enabled boolean default true,removed_at timestamptz,onboarding_required boolean default false,email text,role text default 'staff');
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),banned_until timestamptz,last_sign_in_at timestamptz,raw_app_meta_data jsonb default '{}');
 create table public.departments(id uuid,name text);
 create table public.outsourced_doctors(id uuid primary key,profile_id uuid,clinician_type text default 'outsourced',status text default 'active',archived_at timestamptz,self_service_enabled boolean default true,email text);
 create table public.audit_logs(actor_id uuid,action text,entity_type text,entity_id uuid,after_data jsonb,created_at timestamptz default now());
 create function public.has_permission(text,uuid default auth.uid()) returns boolean language sql stable security definer as $$select $2='${manager}'::uuid$$;
 create function public.profile_role_is_protected(text) returns boolean language sql stable as $$select false$$;
 insert into profiles(id,full_name,is_employee,email) values('${manager}','Manager',true,'manager@example.test'),('${staff}','Varna probation',true,'staff@example.test'),('${external}','External',false,'external@example.test');
 update profiles set status='probation' where id='${staff}';update profiles set workforce_visible=false,onboarding_required=true where id='${external}';
 insert into auth.users(id,email) select id,email from profiles;
 update auth.users set raw_app_meta_data=jsonb_build_object('existing_clinician_id','${doctor}') where id='${external}';
 insert into outsourced_doctors(id,profile_id,email) values('${doctor}','${external}','external@example.test');`);
 await db.exec(fn('organization_directory')+fn('organization_people_directory'));
 await db.exec(migration.slice(migration.indexOf('create table clinician_private.temporary_credential_requests')));
 await asUser(manager);
},30_000);
afterAll(async()=>{await db?.close();});
describe('credential and classified directory SQL boundaries',()=>{
 it('includes probation staff and pending external directory entries without HR editing or invented parents',async()=>{
  const rows=(await db.query<{id:string,person_type:string,can_edit:boolean,manager_id:string}>('select * from organization_people_directory()')).rows;
  expect(rows.some(p=>p.id===staff&&p.person_type==='employee')).toBe(true);
  expect(rows.some(p=>p.id===external&&p.person_type==='outsourced_clinician'&&!p.can_edit&&p.manager_id===null)).toBe(true);
  expect((await db.query('select * from organization_directory() where id=$1',[external])).rows).toHaveLength(0);
 });
 it.each([
  "update outsourced_doctors set archived_at=now()", "update outsourced_doctors set self_service_enabled=false", "update outsourced_doctors set profile_id=null",
  "update profiles set status='inactive' where not is_employee", "update profiles set login_enabled=false where not is_employee", "update auth.users set banned_until=now()+interval '1 day' where id='"+external+"'", "delete from auth.users where id='"+external+"'",
 ])('excludes ineligible external projection: %s',async sql=>{
  await db.exec('reset role;begin');
  try {await db.exec(sql);await asUser(manager);expect((await db.query('select * from organization_people_directory() where id=$1',[external])).rows).toHaveLength(0);}finally {await db.exec('rollback;reset role');await asUser(manager);}
 });
 it('ordinary staff and external accounts cannot reserve credentials',async()=>{
  for(const id of [staff,external]){await asUser(id);await expect(db.query('select reserve_clinician_temporary_credential($1,$2)',[doctor,crypto.randomUUID()])).rejects.toThrow('manager permission');}
  await asUser(manager);
 });
 it('denies completed onboarding and sign-in history',async()=>{
  await db.exec('reset role;begin');
  try {await db.query('update profiles set onboarding_required=false where id=$1',[external]);await asUser(manager);expect(await status()).toBe('onboarding_complete');await db.exec('savepoint denied_request');await expect(db.query('select reserve_clinician_temporary_credential($1,$2)',[doctor,crypto.randomUUID()])).rejects.toThrow('not eligible');await db.exec('rollback to savepoint denied_request;reset role');await db.query('update profiles set onboarding_required=true where id=$1',[external]);await db.query('update auth.users set last_sign_in_at=now() where id=$1',[external]);await asUser(manager);expect(await status()).toBe('manual_review');}
  finally {await db.exec('rollback;reset role');await asUser(manager);}
 });
 it('serializes resets, binds requests, denies direct table/finish access and audits only identity',async()=>{
  const request=crypto.randomUUID();
  const reserve=async(id:string)=>(await db.query<{value:any}>('select reserve_clinician_temporary_credential($1,$2) value',[doctor,id])).rows[0].value;
  expect((await reserve(request)).newly_reserved).toBe(true);expect((await reserve(request)).newly_reserved).toBe(false);
  await expect(db.query('select validate_clinician_temporary_credential($1)',[request])).rejects.toThrow('permission denied');
  await asUser(manager,'service_role');
  expect((await db.query<{ok:boolean}>('select validate_clinician_temporary_credential($1) ok',[request])).rows[0].ok).toBe(true);
  await db.exec('reset role');await db.query('update profiles set login_enabled=false where id=$1',[external]);await asUser(manager,'service_role');
  expect((await db.query<{ok:boolean}>('select validate_clinician_temporary_credential($1) ok',[request])).rows[0].ok).toBe(false);
  await db.exec('reset role');await db.query('update profiles set login_enabled=true where id=$1',[external]);await asUser(manager);
  await expect(reserve(crypto.randomUUID())).rejects.toThrow('not eligible');
  await expect(db.query('select * from clinician_private.temporary_credential_requests')).rejects.toThrow('permission denied');
  await expect(db.query('select finish_clinician_temporary_credential($1,true)',[request])).rejects.toThrow('permission denied');
  await asUser(manager,'service_role');await db.query('select finish_clinician_temporary_credential($1,true)',[request]);
  await asUser(manager);expect((await reserve(request)).status).toBe('completed');
  await db.exec('reset role');const audit=(await db.query<{after_data:any,action:string,entity_id:string}>('select * from audit_logs')).rows[0];
  expect(audit.after_data).toEqual({clinician_id:doctor});expect(audit.action).toBe('temporary_credential_regenerated');expect(audit.entity_id).toBe(external);
 });
});
