import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260929141022_appointment_scheduler_client_access.sql';
const migration = readFileSync(migrationPath, 'utf8');
const conversionMigration = readFileSync('supabase/migrations/20260922042039_normalize_lead_gender_conversion.sql', 'utf8');
let db: PGlite | undefined;

const userId = '10000000-0000-4000-8000-000000000001';
const activeClient = '20000000-0000-4000-8000-000000000001';
const careClient = '20000000-0000-4000-8000-000000000002';
const archivedClient = '20000000-0000-4000-8000-000000000003';
const deletedClient = '20000000-0000-4000-8000-000000000004';

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup() {
  db = new PGlite();
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.test_user', true), '')::uuid
    $$;
    create table public.patients(
      id uuid primary key,
      full_name text not null,
      patient_number text,
      phone text,
      slug text,
      deleted_at timestamptz,
      archived_at timestamptz
    );
    create or replace function public.appointment_has_permission(action text)
    returns boolean language sql stable as $$
      select action = 'create' and coalesce(nullif(current_setting('app.can_create', true), '')::boolean, false)
        or action <> 'create' and coalesce(nullif(current_setting('app.can_other', true), '')::boolean, false)
    $$;
    create or replace function public.patient_care_access(target_patient uuid)
    returns boolean language sql stable as $$
      select target_patient = nullif(current_setting('app.care_patient', true), '')::uuid
    $$;
    insert into public.patients(id, full_name, patient_number, phone, slug, deleted_at, archived_at) values
      ('${activeClient}', 'Newly Converted Client', 'BS-051', '0500000051', 'newly-converted-client', null, null),
      ('${careClient}', 'Care Scope Client', 'BS-052', '0500000052', 'care-scope-client', null, null),
      ('${archivedClient}', 'Archived Client', 'BS-053', '0500000053', 'archived-client', null, now()),
      ('${deletedClient}', 'Deleted Client', 'BS-054', '0500000054', 'deleted-client', now(), null);
    set app.test_user = '${userId}';
    set app.can_create = 'true';
    set app.can_other = 'true';
    set app.care_patient = '${careClient}';
  `);
  await db.exec(migration);
  return db;
}

describe('appointment scheduler client access hotfix', () => {
  it('lets an authorized scheduler select and create for an active converted client outside clinical care scope', async () => {
    const database = await setup();
    const access = await database.query<{ care: boolean; create_allowed: boolean }>(`
      select public.patient_care_access('${activeClient}') care,
        public.appointment_patient_access('create', '${activeClient}') create_allowed
    `);
    const options = await database.query<{ id: string }>(`
      select id from public.appointment_patient_options('Newly Converted', 0, 25, null)
    `);

    expect(access.rows[0]).toEqual({ care: false, create_allowed: true });
    expect(options.rows.map(row => row.id)).toEqual([activeClient]);
  }, 30_000);

  it('keeps archived and deleted clients out of selection and appointment creation', async () => {
    const database = await setup();
    const access = await database.query<{ archived: boolean; deleted: boolean }>(`
      select public.appointment_patient_access('create', '${archivedClient}') archived,
        public.appointment_patient_access('create', '${deletedClient}') deleted
    `);
    const options = await database.query<{ id: string }>(`
      select id from public.appointment_patient_options(null, 0, 100, null)
    `);

    expect(access.rows[0]).toEqual({ archived: false, deleted: false });
    expect(options.rows.map(row => row.id)).toEqual([careClient, activeClient]);
  }, 30_000);

  it('denies unauthenticated and non-scheduler callers without broadening clinical actions', async () => {
    const database = await setup();
    await database.exec("set app.can_create = 'false';");
    let access = await database.query<{ create_allowed: boolean; option_count: number }>(`
      select public.appointment_patient_access('create', '${activeClient}') create_allowed,
        (select count(*)::int from public.appointment_patient_options(null, 0, 100, null)) option_count
    `);
    expect(access.rows[0]).toEqual({ create_allowed: false, option_count: 0 });

    await database.exec("set app.can_create = 'true'; set app.test_user = ''; ");
    access = await database.query<{ create_allowed: boolean; option_count: number }>(`
      select public.appointment_patient_access('create', '${activeClient}') create_allowed,
        (select count(*)::int from public.appointment_patient_options(null, 0, 100, null)) option_count
    `);
    expect(access.rows[0]).toEqual({ create_allowed: false, option_count: 0 });

    await database.exec(`set app.test_user = '${userId}';`);
    const clinical = await database.query<{ view_without_care: boolean; update_without_care: boolean; view_with_care: boolean }>(`
      select public.appointment_patient_access('view', '${activeClient}') view_without_care,
        public.appointment_patient_access('update', '${activeClient}') update_without_care,
        public.appointment_patient_access('view', '${careClient}') view_with_care
    `);
    expect(clinical.rows[0]).toEqual({ view_without_care: false, update_without_care: false, view_with_care: true });
  }, 30_000);

  it('preserves the real lead conversion linkage and makes the new client immediately schedulable', async () => {
    db = new PGlite();
    await db.exec(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      end $$;
      create schema auth;
      create or replace function auth.uid() returns uuid language sql stable as $$ select '${userId}'::uuid $$;
      create table public.crm_lead_sources(id uuid primary key default gen_random_uuid(), name text);
      create table public.crm_lead_statuses(id uuid primary key default gen_random_uuid(), name text);
      create table public.crm_leads(
        id uuid primary key default gen_random_uuid(), archived_at timestamptz, assigned_to uuid,
        converted_patient_id uuid, source_id uuid, gender text, full_name text, phone text,
        location text, reason_for_enquiry text, remarks text, converted_at timestamptz,
        status_id uuid, updated_at timestamptz
      );
      create table public.patients(
        id uuid primary key default gen_random_uuid(), patient_number text unique, full_name text,
        phone text, gender text, address text, source text, status text, tags text[], created_by uuid,
        slug text default gen_random_uuid()::text, deleted_at timestamptz, archived_at timestamptz
      );
      create table public.patient_notes(
        id uuid primary key default gen_random_uuid(), patient_id uuid, note_type text,
        content text, visibility text, created_by uuid
      );
      create table public.audit_logs(
        id uuid primary key default gen_random_uuid(), actor_id uuid, action text,
        entity_type text, entity_id uuid, after_data jsonb
      );
      create or replace function public.has_permission(permission_code text)
      returns boolean language sql stable as $$ select true $$;
      create or replace function public.crm_lead_can_view(assigned_to uuid, converted_patient_id uuid)
      returns boolean language sql stable as $$ select true $$;
      create or replace function public.appointment_has_permission(action text)
      returns boolean language sql stable as $$ select action = 'create' $$;
      create or replace function public.patient_care_access(target_patient uuid)
      returns boolean language sql stable as $$ select false $$;
      insert into public.crm_lead_sources(name) values ('Website');
      insert into public.crm_lead_statuses(name) values ('Converted');
      insert into public.crm_leads(source_id, gender, full_name, phone, assigned_to)
      select id, 'Female', 'Synthetic Converted Client', '0500000099', '${userId}'
      from public.crm_lead_sources limit 1;
    `);
    await db.exec(conversionMigration);
    await db.exec(migration);

    const lead = await db.query<{ id: string }>('select id from public.crm_leads limit 1');
    const converted = await db.query<{ patient_id: string }>(`
      select patient_id from public.convert_lead_to_patient('${lead.rows[0].id}', 'BS-099')
    `);
    const linked = await db.query<{ converted_at: string; converted_patient_id: string; patient_count: number }>(`
      select l.converted_at::text, l.converted_patient_id,
        (select count(*)::int from public.patients where patient_number = 'BS-099') patient_count
      from public.crm_leads l where l.id = '${lead.rows[0].id}'
    `);
    const originalConvertedAt = linked.rows[0].converted_at;
    const schedulable = await db.query<{ id: string }>(`
      select id from public.appointment_patient_options('Synthetic Converted', 0, 25, null)
    `);
    const afterSelection = await db.query<{ converted_at: string; patient_count: number; create_allowed: boolean }>(`
      select l.converted_at::text,
        (select count(*)::int from public.patients where patient_number = 'BS-099') patient_count,
        public.appointment_patient_access('create', l.converted_patient_id) create_allowed
      from public.crm_leads l where l.id = '${lead.rows[0].id}'
    `);

    expect(linked.rows[0].converted_patient_id).toBe(converted.rows[0].patient_id);
    expect(linked.rows[0].patient_count).toBe(1);
    expect(schedulable.rows.map(row => row.id)).toEqual([converted.rows[0].patient_id]);
    expect(afterSelection.rows[0]).toEqual({ converted_at: originalConvertedAt, patient_count: 1, create_allowed: true });
  }, 30_000);

  it('keeps the migration forward-only and identity-scoped', () => {
    expect(migration).toContain("when action = 'create' then exists");
    expect(migration).toContain("public.appointment_has_permission('create')");
    expect(migration).toContain('p.deleted_at is null');
    expect(migration).toContain('p.archived_at is null');
    expect(migration).not.toMatch(/create or replace function public\.patient_care_access|patient_notes|patient_documents|patient_sessions/);
    expect(migration).not.toMatch(/alter table|insert into|update public|delete from|drop table/);
  });
});
