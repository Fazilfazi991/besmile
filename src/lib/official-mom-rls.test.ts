import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Execute real PostgreSQL RLS, including the existing permissive policies.
// The harness supplies only Supabase's auth/storage helpers and minimal tables;
// it is not a substitute for the deployed Storage API integration check.
let db: PGlite;
const creator = '10000000-0000-4000-8000-000000000001';
const manager = '10000000-0000-4000-8000-000000000002';
const employee = '10000000-0000-4000-8000-000000000003';
const otherCreator = '10000000-0000-4000-8000-000000000004';
const path = (uid = creator, name = 'minutes.pdf') => `company/${uid}/mom/20000000-0000-4000-8000-000000000001-${name}`;
const source = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8');
async function asUser(uid: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec('set role authenticated');
}
async function record(overrides: Record<string, unknown> = {}) {
  const row = { title: 'Meeting minutes', description: '', category: 'Official:Minutes of Meeting (MOM)', document_type: 'minutes_of_meeting',
    uploaded_by: creator, storage_path: path(), source_type: 'uploaded', file_name: 'minutes.pdf', file_size: 100, mime_type: 'application/pdf', ...overrides };
  const keys = Object.keys(row);
  return db.query(`insert into public.documents (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(row));
}
async function object(uid = creator, name = path(uid)) {
  return db.query('insert into storage.objects(bucket_id,owner_id,name) values ($1,$2,$3) returning name', ['employee-documents', uid, name]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    create function storage.filename(text) returns text language sql immutable as $$ select (string_to_array($1,'/'))[array_length(string_to_array($1,'/'),1)] $$;
    create function storage.extension(text) returns text language sql immutable as $$ select reverse(split_part(reverse($1),'.',1)) $$;
    create function storage.allow_only_operation(text) returns boolean language sql stable as $$ select coalesce(current_setting('storage.operation',true),'') = $1 $$;
    create table public.profiles(id uuid primary key, status text);
    create table public.permissions(id uuid primary key default gen_random_uuid(), code text unique, description text);
    create table public.user_permission_grants(profile_id uuid, permission_id uuid, reason text, starts_at timestamptz default now(), expires_at timestamptz, revoked_at timestamptz);
    create table public.test_permissions(profile_id uuid, code text);
    create function public.has_permission(permission_code text) returns boolean language sql stable as $$ select exists(select 1 from public.test_permissions where profile_id=auth.uid() and code=permission_code) $$;
    create function public.current_role() returns text language sql stable as $$ select 'staff'::text $$;
    create function public.document_manager_can_manage(uuid) returns boolean language sql stable as $$ select public.has_permission('documents.manage') $$;
    create function public.official_document_employee_is_selectable(uuid) returns boolean language sql stable as $$ select false $$;
    create table public.documents(id uuid primary key default gen_random_uuid(), title text, description text, category text, document_type text, uploaded_by uuid,
      storage_path text, source_type text default 'uploaded', file_name text, file_size bigint, mime_type text, generated_at timestamptz, page_count int,
      official_status text, related_profile_id uuid, created_at timestamptz default now());
    create table public.document_shares(document_id uuid, profile_id uuid, shared_with_all boolean);
    create table public.document_requests(id uuid, profile_id uuid);
    create table public.document_submissions(storage_path text, submitted_by uuid, request_id uuid);
    create table public.audit_logs(actor_id uuid, action text, entity_type text, entity_id uuid, after_data jsonb);
    create table storage.objects(bucket_id text, owner_id text, name text primary key);
    create table storage.buckets(id text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    insert into storage.buckets values ('employee-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated;
    grant select,insert,update,delete on public.documents,public.document_shares,public.document_requests,public.document_submissions,storage.objects to authenticated;
    grant select on public.test_permissions to authenticated;
    insert into public.test_permissions values
      ('${creator}','documents.official.generate'), ('${otherCreator}','documents.official.generate'), ('${manager}','documents.manage');
  `);
  await db.exec(source('0063_document_center_rls_policy_repair.sql'));
  await db.exec(source('0066_employee_document_upload_return_policy.sql'));
  await db.exec(source('0067_employee_document_storage_insert_compatibility.sql'));
  const generationPolicies = source('20260915144157_e5_official_document_creation.sql').match(/create policy[\s\S]*?;(?=\s*(?:--|create|\n))/g);
  if (!generationPolicies?.length) throw Error('Missing baseline generation policies');
  for (const sql of generationPolicies) await db.exec(sql);
  await db.exec(source('20260923105301_official_mom_upload.sql'));
  await db.exec(source('20260923114731_official_mom_explicit_access.sql'));
  await db.exec(`insert into public.profiles values ('${creator}','active'),('${manager}','active'),('${otherCreator}','active'),('${employee}','active');`);
}, 60000);
beforeEach(async () => {
  await db.exec('reset role; truncate public.documents,public.document_shares,public.audit_logs,storage.objects');
  await db.query("select set_config('storage.operation','',false)");
  await db.exec(`truncate public.user_permission_grants;
    update public.profiles set status='active';
    insert into public.user_permission_grants(profile_id,permission_id)
    select profile.id,permission.id from public.profiles profile cross join public.permissions permission
    where profile.id in ('${creator}','${manager}') and permission.code='documents.mom.upload';`);
  await asUser(creator);
});
afterAll(async () => { await db?.close(); });

describe('MOM PostgreSQL authorization', () => {
  it('blocks another generation-only user without an explicit MOM grant', async () => {
    await asUser(otherCreator);
    await expect(object(otherCreator)).rejects.toThrow(/row-level security/);
    await expect(record({ uploaded_by: otherCreator, storage_path: path(otherCreator) })).rejects.toThrow(/row-level security/);
    // Existing generation permission and its Storage path remain available.
    await object(otherCreator, `company/${otherCreator}/official/letter.pdf`);
  });
  it('blocks managers without a MOM grant despite permissive baseline policies', async () => {
    await db.exec('reset role');
    await db.query('delete from public.user_permission_grants where profile_id=$1', [manager]);
    await asUser(manager);
    await expect(object(manager)).rejects.toThrow(/row-level security/);
    await expect(record({ uploaded_by: manager, storage_path: path(manager) })).rejects.toThrow(/row-level security/);
    await object(manager, `company/${manager}/official/policy.pdf`);
    await object(manager, `${manager}/request/mom/personal.pdf`);
    await record({ uploaded_by: manager, storage_path: `company/${manager}/official/policy.pdf`, document_type: 'policy', category: 'Policy' });
  });
  it.each(['revoked_at=now()', "expires_at=now()-interval '1 day'", "starts_at=now()+interval '1 day'"])(
    'rejects a grant with %s immediately', async mutation => {
      await db.exec('reset role');
      await db.exec(`update public.user_permission_grants set ${mutation}`);
      await asUser(creator);
      await expect(object()).rejects.toThrow(/row-level security/);
      await expect(record()).rejects.toThrow(/row-level security/);
    });
  it('rejects inactive accounts even with an explicit grant', async () => {
    await db.exec("reset role; update public.profiles set status='inactive'");
    await asUser(creator);
    await expect(object()).rejects.toThrow(/row-level security/);
  });
  it('does not let implicit all-permission administrators bypass explicit MOM grants', async () => {
    await db.exec('reset role');
    const original = (await db.query<{ definition: string }>("select pg_get_functiondef('public.has_permission(text)'::regprocedure) as definition")).rows[0].definition;
    try {
      await db.exec('create or replace function public.has_permission(permission_code text) returns boolean language sql stable as $$ select true $$');
      await asUser(employee);
      expect((await db.query('select public.official_mom_upload_allowed() as allowed')).rows).toEqual([{ allowed: false }]);
      await expect(object(employee)).rejects.toThrow(/row-level security/);
      await expect(record({ uploaded_by: employee, storage_path: path(employee) })).rejects.toThrow(/row-level security/);
    } finally { await db.exec('reset role'); await db.exec(original); }
  });
  it('allows explicitly approved generation-only MOM upload without manager grants', async () => {
    expect((await object()).rows).toHaveLength(1);
    expect((await record()).rows).toHaveLength(1);
    expect((await db.query('select * from public.documents')).rows).toHaveLength(1);
    expect((await db.query("select public.has_permission('documents.manage') as allowed")).rows).toEqual([{ allowed: false }]);
  });
  it('allows an explicitly approved manager upload and existing read access', async () => {
    await record(); await asUser(manager);
    expect((await db.query('select * from public.documents')).rows).toHaveLength(1);
    await object(manager); await record({ uploaded_by: manager, storage_path: path(manager) });
  });
  it('blocks an ordinary employee from MOM metadata and Storage', async () => {
    await object(); await record(); await asUser(employee);
    expect((await db.query('select * from public.documents')).rows).toHaveLength(0);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await expect(object(employee)).rejects.toThrow(/row-level security/);
    await expect(record({ uploaded_by: employee, storage_path: path(employee) })).rejects.toThrow(/row-level security/);
  });
  it('does not let one creator view another creator MOM', async () => {
    await object(); await record(); await asUser(otherCreator);
    expect((await db.query('select * from public.documents')).rows).toHaveLength(0);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  });
  it('preserves explicit existing shared-document visibility', async () => {
    const inserted = await record(); await object(); await asUser(manager);
    await db.query('insert into public.document_shares values ($1,$2,false)', [(inserted.rows[0] as { id: string }).id, employee]);
    await asUser(employee);
    expect((await db.query('select * from public.documents')).rows).toHaveLength(1);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1);
    await expect(object(employee)).rejects.toThrow(/row-level security/);
  });
  it.each([
    { document_type: 'policy' }, { source_type: 'official_generated' }, { uploaded_by: manager },
    { storage_path: path(manager) }, { category: 'Policy' }, { mime_type: 'image/png' },
    { file_size: 0 }, { file_size: 10485761 }, { title: ' ' }, { file_name: 'other.pdf' },
    { official_status: 'available' }, { related_profile_id: employee },
  ])('rejects invalid or forged direct metadata %j', async change => {
    await expect(record(change)).rejects.toThrow(/row-level security/);
  });
  it('also rejects forged MOM attribution for an existing manager', async () => {
    await asUser(manager);
    await expect(record()).rejects.toThrow(/row-level security/);
  });
  it('prevents managers reassigning MOM identity or laundering its type after insertion', async () => {
    await record(); await asUser(manager);
    await expect(db.query('update public.documents set uploaded_by=$1', [manager])).rejects.toThrow(/cannot be reassigned/);
    await expect(db.query("update public.documents set document_type='policy'")).rejects.toThrow(/cannot be reassigned/);
    await expect(db.query('update public.documents set storage_path=$1', [path(manager)])).rejects.toThrow(/cannot be reassigned/);
    await expect(db.query("update public.documents set source_type='official_generated'")).rejects.toThrow(/cannot be reassigned/);
  });
  it('preserves existing manager title edits', async () => {
    await record(); await asUser(manager);
    expect((await db.query("update public.documents set title='Corrected title' returning title")).rows).toEqual([{ title: 'Corrected title' }]);
  });
  it.each([
    `company/${creator}/anything.pdf`, `company/${creator}/mom/anything.pdf`,
    path(manager), path(creator, 'minutes.exe.pdf'), path(creator, '../minutes.pdf'),
    path(creator, 'minutes.docx'), path(creator, 'minutes.svg'),
  ])('blocks general, unsafe, or foreign storage path %s', async name => {
    await expect(object(creator, name)).rejects.toThrow(/row-level security/);
  });
  it('does not grant saved-document update/delete or object replacement/deletion', async () => {
    await object(); await record();
    expect((await db.query("update public.documents set title='changed' returning id")).rows).toHaveLength(0);
    expect((await db.query('delete from public.documents returning id')).rows).toHaveLength(0);
    expect((await db.query("update storage.objects set name='changed' returning name")).rows).toHaveLength(0);
    expect((await db.query('delete from storage.objects returning name')).rows).toHaveLength(0);
  });
  it('permits only own unreferenced upload cleanup', async () => {
    await object();
    expect((await db.query('delete from storage.objects returning name')).rows).toHaveLength(1);
  });
  it('blocks MOM directory listing for a generation-only user', async () => {
    await object(); await record();
    await db.query("select set_config('storage.operation','object.list',false)");
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  });
  it('preserves existing generated PDF creation', async () => {
    const generatedPath = `company/${creator}/official/letter.pdf`;
    await object(creator, generatedPath);
    await record({ storage_path: generatedPath, source_type: 'official_generated', document_type: 'offer_letter', category: 'Official:Offer Letter', official_status: 'available' });
  });
  it('records the authenticated actor without exposing the audit trigger as an RPC', async () => {
    await record();
    await expect(db.query('select public.official_mom_audit_event()')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
    expect((await db.query('select actor_id,action from public.audit_logs')).rows).toEqual([{ actor_id: creator, action: 'official_document_uploaded' }]);
  });
});
