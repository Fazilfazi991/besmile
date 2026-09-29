import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260929174027_automatic_client_ids_and_historical_repair.sql',
  'utf8',
);
const dialog = readFileSync('src/components/lead-to-patient-conversion.tsx', 'utf8');
const adminRepository = readFileSync('src/lib/admin-repository.ts', 'utf8');
const employeeRepository = readFileSync('src/lib/employee-repository.ts', 'utf8');
const patientUi = readFileSync('src/components/patient-ui.tsx', 'utf8');
const releaseTwoMigration = readFileSync(
  'supabase/migrations/20260929110000_release_2_workflows_and_client_sessions.sql',
  'utf8',
);

const userId = '10000000-0000-4000-8000-000000000001';
let db: PGlite | undefined;

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
    set app.test_user = '${userId}';

    create table public.crm_lead_sources(
      id uuid primary key default gen_random_uuid(),
      name text not null
    );
    create table public.crm_lead_statuses(
      id uuid primary key default gen_random_uuid(),
      name text not null
    );
    create table public.crm_leads(
      id uuid primary key default gen_random_uuid(),
      archived_at timestamptz,
      assigned_to uuid,
      converted_patient_id uuid,
      source_id uuid,
      gender text,
      full_name text,
      phone text,
      location text,
      reason_for_enquiry text,
      remarks text,
      converted_at timestamptz,
      status_id uuid,
      updated_at timestamptz default now()
    );
    create table public.patients(
      id uuid primary key default gen_random_uuid(),
      patient_number text not null unique,
      full_name text,
      phone text,
      gender text,
      address text,
      source text,
      status text,
      tags text[],
      created_by uuid,
      slug text default gen_random_uuid()::text,
      deleted_at timestamptz,
      archived_at timestamptz
    );
    create table public.patient_notes(
      id uuid primary key default gen_random_uuid(),
      patient_id uuid,
      note_type text,
      content text,
      visibility text,
      created_by uuid
    );
    create table public.audit_logs(
      id uuid primary key default gen_random_uuid(),
      actor_id uuid,
      action text,
      entity_type text,
      entity_id uuid,
      after_data jsonb
    );
    create table public.crm_sales(
      id uuid primary key default gen_random_uuid(),
      lead_id uuid not null unique,
      sale_value numeric(12,2) not null
    );
    create table public.finance_invoices(
      id uuid primary key default gen_random_uuid(),
      sale_id uuid,
      patient_id uuid
    );
    create table public.finance_invoice_payments(
      id uuid primary key default gen_random_uuid(),
      invoice_id uuid,
      amount numeric(14,2) not null
    );
    create table public.finance_transactions(
      id uuid primary key default gen_random_uuid(),
      invoice_id uuid,
      amount numeric(14,2) not null
    );

    create or replace function public.has_permission(permission_code text)
    returns boolean language sql stable as $$ select true $$;
    create or replace function public.crm_lead_can_view(assigned_to uuid, converted_patient_id uuid)
    returns boolean language sql stable as $$ select true $$;
    create or replace function public.reconcile_converted_patient_finance(target_lead uuid, target_patient uuid)
    returns integer language sql as $$ select 0 $$;
    create or replace function public.preserve_lead_conversion_linkage()
    returns trigger language plpgsql as $$
    begin
      if old.converted_at is not null and new.converted_at is distinct from old.converted_at then
        new.converted_at := old.converted_at;
      end if;
      if old.converted_patient_id is null and new.converted_patient_id is not null then
        perform public.reconcile_converted_patient_finance(new.id, new.converted_patient_id);
      end if;
      return new;
    end $$;
    create trigger preserve_lead_conversion_linkage
      before update of converted_at, converted_patient_id on public.crm_leads
      for each row execute function public.preserve_lead_conversion_linkage();

    create or replace function public.repair_converted_lead_client_linkage(
      target_lead uuid,
      approved_patient_number text,
      execute_repair boolean default false
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;

    insert into public.crm_lead_sources(name) values ('Website');
    insert into public.crm_lead_statuses(name) values ('Converted');
    insert into public.patients(patient_number, full_name) values
      ('BSM00001', 'Existing One'),
      ('BSM00008', 'Existing Eight'),
      ('BSM0004', 'Legacy Four'),
      ('QA-NONCANONICAL-99999', 'QA Fixture');
  `);
  await db.exec(migration);
  return db;
}

async function createLead(
  database: PGlite,
  id: string,
  name: string,
  convertedAt: string | null = null,
) {
  await database.exec(`
    insert into public.crm_leads(
      id, source_id, gender, full_name, phone, assigned_to, converted_at
    )
    select '${id}', id, 'Female', '${name}', '0500000000', '${userId}',
      ${convertedAt ? `'${convertedAt}'::timestamptz` : 'null'}
    from public.crm_lead_sources limit 1;
  `);
}

describe('automatic canonical Client IDs and historical repair', () => {
  it('keeps Client ID authority in PostgreSQL and removes the manual UI field', () => {
    expect(migration).toContain('private.client_number_counters');
    expect(migration).toContain("patient_number ~ '^BSM[0-9]{5}$'");
    expect(migration).toContain('on conflict (prefix) do update');
    expect(migration).toContain('private.allocate_next_client_number()');
    expect(migration).toContain('assign_client_number_on_insert');
    expect(migration).toContain('for update');
    expect(migration).toContain("'automatic_client_number', true");
    expect(dialog).toContain('Client ID will be generated automatically.');
    expect(dialog).not.toMatch(/<input|patientNumber|Enter unique Client ID/);
    expect(adminRepository).toContain("{target_lead:leadId}");
    expect(employeeRepository).toContain('target_lead: leadId');
    expect(employeeRepository).not.toContain('requested_patient_number: patientNumber');
    expect(patientUi).toContain('Client ID will be generated automatically.');
    expect(patientUi).not.toContain("['patient_number', 'Patient ID']");
  });

  it('allocates distinct canonical IDs, preserves legacy values, and is retry-idempotent', async () => {
    const database = await setup();
    const firstLead = '20000000-0000-4000-8000-000000000001';
    const secondLead = '20000000-0000-4000-8000-000000000002';
    await createLead(database, firstLead, 'Concurrent One');
    await createLead(database, secondLead, 'Concurrent Two');

    await Promise.all([
      database.query(`select * from public.convert_lead_to_patient('${firstLead}')`),
      database.query(`select * from public.convert_lead_to_patient('${secondLead}')`),
    ]);

    const allocated = await database.query<{ patient_number: string }>(`
      select patient_number from public.patients
      where patient_number ~ '^BSM[0-9]{5}$'
      order by patient_number
    `);
    expect(allocated.rows.map((row) => row.patient_number)).toEqual([
      'BSM00001',
      'BSM00008',
      'BSM00009',
      'BSM00010',
    ]);

    await database.query(`select * from public.convert_lead_to_patient('${firstLead}')`);
    const afterRetry = await database.query<{
      patient_count: number;
      last_value: number;
      legacy_count: number;
    }>(`
      select
        (select count(*)::int from public.patients where patient_number in ('BSM00009', 'BSM00010')) patient_count,
        (select last_value::int from private.client_number_counters where prefix = 'BSM') last_value,
        (select count(*)::int from public.patients where patient_number = 'BSM0004') legacy_count
    `);
    expect(afterRetry.rows[0]).toEqual({ patient_count: 2, last_value: 10, legacy_count: 1 });

    await database.exec(`
      insert into public.patients(patient_number, full_name) values (null, 'Direct Client');
      insert into public.patients(patient_number, full_name) values ('QA-EXPLICIT-001', 'QA Fixture');
    `);
    const direct = await database.query<{ patient_number: string }>(`
      select patient_number from public.patients
      where full_name = 'Direct Client' or patient_number = 'QA-EXPLICIT-001'
      order by full_name
    `);
    expect(direct.rows.map((row) => row.patient_number)).toEqual(['BSM00011', 'QA-EXPLICIT-001']);
  }, 30_000);

  it('repairs eight historical rows in deterministic order without changing finance', async () => {
    const database = await setup();
    const leadIds = Array.from({ length: 8 }, (_, index) =>
      `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    );

    for (const [index, leadId] of leadIds.entries()) {
      const convertedAt = `2026-0${Math.floor(index / 3) + 1}-${String(index + 1).padStart(2, '0')}T08:00:00Z`;
      await createLead(database, leadId, `Historical ${index + 1}`, convertedAt);
      await database.exec(`
        insert into public.crm_sales(id, lead_id, sale_value)
        values ('40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}', '${leadId}', ${800 + index * 50});
      `);
    }

    await database.exec(`
      insert into public.finance_invoices(id, sale_id)
      values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001');
      insert into public.finance_invoice_payments(id, invoice_id, amount)
      values ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 250);
      insert into public.finance_transactions(id, invoice_id, amount)
      values ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 250);
    `);

    const before = await database.query<{
      sales: number;
      sale_total: string;
      invoices: number;
      payments: number;
      payment_total: string;
      ledger: number;
      ledger_total: string;
    }>(`
      select
        (select count(*)::int from public.crm_sales) sales,
        (select sum(sale_value)::text from public.crm_sales) sale_total,
        (select count(*)::int from public.finance_invoices) invoices,
        (select count(*)::int from public.finance_invoice_payments) payments,
        (select sum(amount)::text from public.finance_invoice_payments) payment_total,
        (select count(*)::int from public.finance_transactions) ledger,
        (select sum(amount)::text from public.finance_transactions) ledger_total
    `);

    const ordered = await database.query<{ id: string; converted_at: string }>(`
      select id, converted_at::text from public.crm_leads
      where converted_at is not null and converted_patient_id is null
      order by converted_at, id
    `);
    const originalTimes = new Map(ordered.rows.map((row) => [row.id, row.converted_at]));
    const mapping: Array<{ leadId: string; patientNumber: string }> = [];

    for (const row of ordered.rows) {
      const repaired = await database.query<{ result: Record<string, string> }>(`
        select public.repair_converted_lead_client_linkage('${row.id}', true) result
      `);
      mapping.push({ leadId: row.id, patientNumber: repaired.rows[0].result.patient_number });
    }

    expect(mapping.map((row) => row.patientNumber)).toEqual([
      'BSM00009', 'BSM00010', 'BSM00011', 'BSM00012',
      'BSM00013', 'BSM00014', 'BSM00015', 'BSM00016',
    ]);

    const retried = await database.query<{ result: Record<string, string> }>(`
      select public.repair_converted_lead_client_linkage('${ordered.rows[0].id}', true) result
    `);
    expect(retried.rows[0].result.status).toBe('already_repaired');
    expect(retried.rows[0].result.patient_number).toBe('BSM00009');

    const after = await database.query<{
      sales: number;
      sale_total: string;
      invoices: number;
      payments: number;
      payment_total: string;
      ledger: number;
      ledger_total: string;
      broken: number;
      repaired: number;
      audit_count: number;
      linked_invoice_count: number;
    }>(`
      select
        (select count(*)::int from public.crm_sales) sales,
        (select sum(sale_value)::text from public.crm_sales) sale_total,
        (select count(*)::int from public.finance_invoices) invoices,
        (select count(*)::int from public.finance_invoice_payments) payments,
        (select sum(amount)::text from public.finance_invoice_payments) payment_total,
        (select count(*)::int from public.finance_transactions) ledger,
        (select sum(amount)::text from public.finance_transactions) ledger_total,
        (select count(*)::int from public.crm_leads where converted_at is not null and converted_patient_id is null) broken,
        (select count(*)::int from public.crm_leads where converted_patient_id is not null) repaired,
        (select count(*)::int from public.audit_logs where action = 'lead_converted_to_patient') audit_count,
        (select count(*)::int from public.finance_invoices where patient_id is not null) linked_invoice_count
    `);

    expect(after).toMatchObject({ rows: [expect.objectContaining(before.rows[0])] });
    expect(after.rows[0]).toMatchObject({
      broken: 0,
      repaired: 8,
      audit_count: 8,
      linked_invoice_count: 1,
    });

    const timestamps = await database.query<{ id: string; converted_at: string }>(`
      select id, converted_at::text from public.crm_leads order by id
    `);
    for (const row of timestamps.rows) {
      expect(row.converted_at).toBe(originalTimes.get(row.id));
    }
  }, 30_000);

  it('keeps demo cleanup on the audited archive path and out of active appointment options', () => {
    expect(releaseTwoMigration).toContain('create or replace function public.archive_patient');
    expect(releaseTwoMigration).toContain('future_appointments>0');
    expect(releaseTwoMigration).toContain('patient_archive_events');
    expect(releaseTwoMigration).toContain('p.deleted_at is null and p.archived_at is null');
    expect(releaseTwoMigration).not.toMatch(/delete from public\.patients/i);
  });
});
