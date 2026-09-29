import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

const migration1Path = 'supabase/migrations/20260929141022_appointment_scheduler_client_access.sql';
const migration2Path = 'supabase/migrations/20260929141023_conversion_client_semantics_and_repair.sql';
const migration1 = readFileSync(migration1Path, 'utf8');
const migration2 = readFileSync(migration2Path, 'utf8');
const canonicalConversion = readFileSync('supabase/migrations/20260922042039_normalize_lead_gender_conversion.sql', 'utf8');
let db: PGlite | undefined;

const actor = '10000000-0000-4000-8000-000000000001';
const account = '20000000-0000-4000-8000-000000000001';

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup() {
  db = new PGlite();
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
    create or replace function public.has_permission(permission_code text) returns boolean language sql stable as $$ select true $$;
    create or replace function public.crm_lead_can_edit(target uuid) returns boolean language sql stable as $$ select true $$;
    create or replace function public.crm_lead_can_view(target uuid, patient uuid) returns boolean language sql stable as $$ select true $$;
    create or replace function public.business_today() returns date language sql stable as $$ select date '2026-09-29' $$;
    create or replace function public.appointment_has_permission(action text) returns boolean language sql stable as $$ select action='create' $$;
    create or replace function public.patient_care_access(target uuid) returns boolean language sql stable as $$ select false $$;

    create table public.crm_lead_sources(id uuid primary key default gen_random_uuid(), name text);
    create table public.crm_lead_statuses(id uuid primary key default gen_random_uuid(), name text);
    create table public.crm_leads(
      id uuid primary key default gen_random_uuid(), lead_date date default current_date,
      full_name text not null, phone text not null, gender text, profession text,
      reason_for_enquiry text, location text, source_id uuid, status_id uuid,
      temperature text default 'cold', remarks text, assigned_to uuid, created_by uuid,
      archived_at timestamptz, converted_at timestamptz, converted_patient_id uuid,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.crm_lead_followups(
      id uuid primary key default gen_random_uuid(), lead_id uuid, outcome text,
      next_follow_up_at timestamptz, created_at timestamptz default now()
    );
    create table public.crm_sales(
      id uuid primary key default gen_random_uuid(), lead_id uuid not null unique,
      closing_date date, sale_value numeric, currency text, service_details text,
      first_session_date date, second_session_date date, third_session_date date,
      notes text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.patients(
      id uuid primary key default gen_random_uuid(), patient_number text unique not null,
      full_name text, phone text, gender text, address text, source text, status text,
      tags text[], created_by uuid, slug text default gen_random_uuid()::text,
      deleted_at timestamptz, archived_at timestamptz
    );
    create table public.patient_notes(
      id uuid primary key default gen_random_uuid(), patient_id uuid, note_type text,
      content text, visibility text, created_by uuid
    );
    create table public.audit_logs(
      id uuid primary key default gen_random_uuid(), actor_id uuid, action text,
      entity_type text, entity_id uuid, before_data jsonb, after_data jsonb,
      created_at timestamptz default now()
    );
    create table public.finance_accounts(id uuid primary key, is_active boolean);
    create table public.finance_invoices(
      id uuid primary key default gen_random_uuid(), invoice_number text unique,
      sale_id uuid, patient_id uuid, customer_name text, customer_phone text,
      issue_date date, due_date date, discount numeric, tax numeric, notes text,
      status text, currency text, created_by uuid, archived_at timestamptz,
      updated_at timestamptz default now()
    );
    create table public.finance_invoice_items(
      id uuid primary key default gen_random_uuid(), invoice_id uuid,
      description text, quantity numeric, rate numeric
    );
    create table public.finance_invoice_payments(
      id uuid primary key default gen_random_uuid(), invoice_id uuid, account_id uuid,
      amount numeric, payment_date date, payment_method text, reference_number text,
      received_by uuid, conversion_sale_id uuid, finance_transaction_id uuid
    );
    create table public.finance_transactions(
      id uuid primary key default gen_random_uuid(), transaction_type text,
      account_id uuid, amount numeric, transaction_date date, payment_method text,
      reference_number text, description text, sale_id uuid, invoice_id uuid,
      patient_id uuid, created_by uuid, archived_at timestamptz
    );

    insert into public.crm_lead_sources(name) values ('Website');
    insert into public.crm_lead_statuses(name) values ('Converted'), ('Contacted');
    insert into public.finance_accounts values ('${account}', true);

    create or replace function public.test_payment_ledger() returns trigger language plpgsql as $$
    declare ledger uuid;
    begin
      insert into public.finance_transactions(
        transaction_type, account_id, amount, transaction_date, payment_method,
        reference_number, description, sale_id, invoice_id, patient_id, created_by
      )
      select 'invoice_payment', new.account_id, new.amount, new.payment_date,
        new.payment_method, new.reference_number, 'Invoice payment', invoice.sale_id,
        invoice.id, invoice.patient_id, new.received_by
      from public.finance_invoices invoice where invoice.id=new.invoice_id
      returning id into ledger;
      update public.finance_invoice_payments set finance_transaction_id=ledger where id=new.id;
      return new;
    end $$;
    create trigger test_payment_ledger after insert on public.finance_invoice_payments
      for each row execute function public.test_payment_ledger();

    create or replace function public.reconcile_converted_patient_finance(target_lead uuid,target_patient uuid)
    returns integer language plpgsql security definer set search_path='' as $$
    declare changed integer;
    begin
      update public.finance_invoices invoice set patient_id=target_patient
      from public.crm_sales sale
      where sale.lead_id=target_lead and invoice.sale_id=sale.id and invoice.patient_id is null;
      get diagnostics changed=row_count;
      return changed;
    end $$;
    create or replace function public.preserve_lead_conversion_linkage()
    returns trigger language plpgsql security definer set search_path='' as $$
    begin
      if old.converted_at is not null and new.converted_at is distinct from old.converted_at then new.converted_at:=old.converted_at; end if;
      if old.converted_patient_id is null and new.converted_patient_id is not null then perform public.reconcile_converted_patient_finance(new.id,new.converted_patient_id); end if;
      return new;
    end $$;
    create trigger preserve_lead_conversion_linkage before update of converted_at,converted_patient_id on public.crm_leads
      for each row execute function public.preserve_lead_conversion_linkage();
  `);
  await db.exec(canonicalConversion);
  await db.exec(migration1);
  await db.exec(migration2);
  return db;
}

async function createLead(database: PGlite, name: string, convertedAt: string | null = null) {
  const row = await database.query<{ id: string }>(`
    insert into public.crm_leads(full_name,phone,gender,location,source_id,status_id,assigned_to,converted_at)
    select '${name}','0500000000','Female','Dubai',source.id,status.id,'${actor}',${convertedAt ? `'${convertedAt}'::timestamptz` : 'null'}
    from public.crm_lead_sources source cross join public.crm_lead_statuses status
    where source.name='Website' and status.name='Contacted'
    returning id
  `);
  return row.rows[0].id;
}

async function recordSale(database: PGlite, leadId: string) {
  await database.query(`select id from public.convert_crm_lead_to_sale_with_payment(
    '${leadId}', 2500, 1000, '${account}', 'cash', date '2026-09-29', 'QA',
    date '2026-10-01', 'INR', date '2026-09-29', 'Therapy package', null, null, null, 'QA sale'
  )`);
}

describe('converted-client semantics and historical repair', () => {
  it('keeps migration 1 unchanged and makes migration 2 forward-only, guarded, and dry-run by default', () => {
    expect(createHash('sha256').update(migration1).digest('hex')).toBe('495337fbc197cf92af447887881bc6c7666c2818c12f9f1aed9c63926126cf25');
    expect(migration2).toContain('execute_repair boolean default false');
    expect(migration2).toContain("when converted_patient_id is null then null");
    expect(migration2).toContain('when lead.converted_patient_id is not null then lead.converted_at::date');
    expect(migration2).toContain("'lead_converted_to_patient'");
    expect(migration2).toContain('invoice.patient_id is distinct from new_patient.id');
    expect(migration2).not.toMatch(/update public\.crm_leads[\s\S]*where converted_at is not null[\s\S]*converted_patient_id is null/i);
  });

  it('passes client, sale-only, both workflow orders, and idempotent historical repair', async () => {
    const database = await setup();

    // A — client conversion.
    const clientFirst = await createLead(database, 'Client First');
    const clientResult = await database.query<{ patient_id: string }>(`select patient_id from public.convert_lead_to_patient('${clientFirst}','BS-A')`);
    let state = await database.query<{ patients: number; audits: number; options: number }>(`
      select (select count(*)::int from public.patients where patient_number='BS-A') patients,
        (select count(*)::int from public.audit_logs where entity_id='${clientFirst}' and action='lead_converted_to_patient') audits,
        (select count(*)::int from public.appointment_patient_options('Client First',0,25,null)) options
    `);
    expect(state.rows[0]).toEqual({ patients: 1, audits: 1, options: 1 });

    // B — sale only.
    const saleOnly = await createLead(database, 'Sale Only');
    await recordSale(database, saleOnly);
    const saleOnlyState = await database.query<{ converted_at: string | null; converted_patient_id: string | null; sales: number; invoices: number; payments: number; ledgers: number }>(`
      select lead.converted_at::text,lead.converted_patient_id,
        (select count(*)::int from public.crm_sales where lead_id=lead.id) sales,
        (select count(*)::int from public.finance_invoices invoice join public.crm_sales sale on sale.id=invoice.sale_id where sale.lead_id=lead.id) invoices,
        (select count(*)::int from public.finance_invoice_payments payment join public.finance_invoices invoice on invoice.id=payment.invoice_id join public.crm_sales sale on sale.id=invoice.sale_id where sale.lead_id=lead.id) payments,
        (select count(*)::int from public.finance_transactions transaction join public.crm_sales sale on sale.id=transaction.sale_id where sale.lead_id=lead.id) ledgers
      from public.crm_leads lead where lead.id='${saleOnly}'
    `);
    expect(saleOnlyState.rows[0]).toEqual({ converted_at: null, converted_patient_id: null, sales: 1, invoices: 1, payments: 1, ledgers: 1 });
    expect((await database.query<{ count: number }>("select count(*)::int count from public.appointment_patient_options('Sale Only',0,25,null)")).rows[0].count).toBe(0);

    // C — client then sale preserves the original timestamp and links invoice.
    const clientThenSale = await createLead(database, 'Client Then Sale');
    const cPatient = await database.query<{ patient_id: string }>(`select patient_id from public.convert_lead_to_patient('${clientThenSale}','BS-C')`);
    const cBefore = (await database.query<{ converted_at: string }>(`select converted_at::text from public.crm_leads where id='${clientThenSale}'`)).rows[0].converted_at;
    await recordSale(database, clientThenSale);
    const cAfter = await database.query<{ converted_at: string; patient_id: string; patients: number; sales: number }>(`
      select lead.converted_at::text,invoice.patient_id,
        (select count(*)::int from public.patients where patient_number='BS-C') patients,
        (select count(*)::int from public.crm_sales where lead_id=lead.id) sales
      from public.crm_leads lead join public.crm_sales sale on sale.lead_id=lead.id join public.finance_invoices invoice on invoice.sale_id=sale.id
      where lead.id='${clientThenSale}'
    `);
    expect(cAfter.rows[0]).toEqual({ converted_at: cBefore, patient_id: cPatient.rows[0].patient_id, patients: 1, sales: 1 });

    // D — sale then client links the existing invoice without duplicating finance.
    const saleThenClient = await createLead(database, 'Sale Then Client');
    await recordSale(database, saleThenClient);
    const dBefore = (await database.query<{ sale_id: string; invoice_id: string; payment_id: string; ledger_id: string }>(`
      select sale.id sale_id,invoice.id invoice_id,payment.id payment_id,payment.finance_transaction_id ledger_id
      from public.crm_sales sale join public.finance_invoices invoice on invoice.sale_id=sale.id
      join public.finance_invoice_payments payment on payment.invoice_id=invoice.id where sale.lead_id='${saleThenClient}'
    `)).rows[0];
    const dPatient = await database.query<{ patient_id: string }>(`select patient_id from public.convert_lead_to_patient('${saleThenClient}','BS-D')`);
    const dAfter = (await database.query<{ sale_id: string; invoice_id: string; payment_id: string; ledger_id: string; patient_id: string }>(`
      select sale.id sale_id,invoice.id invoice_id,payment.id payment_id,payment.finance_transaction_id ledger_id,invoice.patient_id
      from public.crm_sales sale join public.finance_invoices invoice on invoice.sale_id=sale.id
      join public.finance_invoice_payments payment on payment.invoice_id=invoice.id where sale.lead_id='${saleThenClient}'
    `)).rows[0];
    expect(dAfter).toEqual({ ...dBefore, patient_id: dPatient.rows[0].patient_id });

    // Historical repair — dry run, execute, and retry.
    const broken = await createLead(database, 'Historical Broken', '2026-07-15T08:30:00Z');
    await database.exec(`
      insert into public.crm_sales(id,lead_id,closing_date,sale_value,currency,created_by) values ('30000000-0000-4000-8000-000000000001','${broken}','2026-07-15',2500,'INR','${actor}');
      insert into public.finance_invoices(id,invoice_number,sale_id,customer_name,customer_phone,issue_date,status,currency,created_by) values ('40000000-0000-4000-8000-000000000001','HIST-1','30000000-0000-4000-8000-000000000001','Historical Broken','0500000000','2026-07-15','paid','INR','${actor}');
      insert into public.finance_invoice_payments(id,invoice_id,account_id,amount,payment_date,payment_method,received_by,conversion_sale_id) values ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','${account}',2500,'2026-07-15','cash','${actor}','30000000-0000-4000-8000-000000000001');
    `);
    const historicalTimestamp = (await database.query<{ converted_at: string }>(`select converted_at::text from public.crm_leads where id='${broken}'`)).rows[0].converted_at;
    const beforeRepair = (await database.query<{ sale_id: string; invoice_id: string; payment_id: string; ledger_id: string; revenue: string }>(`
      select sale.id sale_id,invoice.id invoice_id,payment.id payment_id,payment.finance_transaction_id ledger_id,
        (select sum(amount)::text from public.finance_transactions where sale_id=sale.id) revenue
      from public.crm_sales sale join public.finance_invoices invoice on invoice.sale_id=sale.id
      join public.finance_invoice_payments payment on payment.invoice_id=invoice.id where sale.lead_id='${broken}'
    `)).rows[0];
    const dryRun = await database.query<{ result: { mode: string; status: string } }>(`select public.repair_converted_lead_client_linkage('${broken}','BS-R') result`);
    expect(dryRun.rows[0].result).toMatchObject({ mode: 'dry_run', status: 'ready' });
    expect((await database.query<{ count: number }>("select count(*)::int count from public.patients where patient_number='BS-R'")).rows[0].count).toBe(0);

    const repaired = await database.query<{ result: { status: string; patient_id: string } }>(`select public.repair_converted_lead_client_linkage('${broken}','BS-R',true) result`);
    const retry = await database.query<{ result: { status: string; patient_id: string } }>(`select public.repair_converted_lead_client_linkage('${broken}','BS-R',true) result`);
    expect(repaired.rows[0].result.status).toBe('repaired');
    expect(retry.rows[0].result).toMatchObject({ status: 'already_repaired', patient_id: repaired.rows[0].result.patient_id });
    const afterRepair = (await database.query<{ sale_id: string; invoice_id: string; payment_id: string; ledger_id: string; revenue: string; converted_at: string; patient_id: string; patients: number; audits: number; options: number }>(`
      select sale.id sale_id,invoice.id invoice_id,payment.id payment_id,payment.finance_transaction_id ledger_id,
        (select sum(amount)::text from public.finance_transactions where sale_id=sale.id) revenue,
        lead.converted_at::text,lead.converted_patient_id patient_id,
        (select count(*)::int from public.patients where patient_number='BS-R') patients,
        (select count(*)::int from public.audit_logs where entity_id=lead.id and action='lead_converted_to_patient') audits,
        (select count(*)::int from public.appointment_patient_options('Historical Broken',0,25,null)) options
      from public.crm_leads lead join public.crm_sales sale on sale.lead_id=lead.id
      join public.finance_invoices invoice on invoice.sale_id=sale.id
      join public.finance_invoice_payments payment on payment.invoice_id=invoice.id where lead.id='${broken}'
    `)).rows[0];
    expect(afterRepair).toMatchObject({ ...beforeRepair, converted_at: historicalTimestamp, patient_id: repaired.rows[0].result.patient_id, patients: 1, audits: 1, options: 1 });

    const summary = (await database.query<{ value: { converted: number } }>("select public.crm_dashboard_summary(date '2020-01-01',date '2030-01-01') value")).rows[0].value;
    expect(summary.converted).toBe(4);
  }, 30_000);
});
