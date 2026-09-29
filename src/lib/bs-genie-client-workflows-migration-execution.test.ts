import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260929110000_release_2_workflows_and_client_sessions.sql', 'utf8');
let db: PGlite | undefined;

afterEach(async () => { await db?.close(); db = undefined; });

describe('BSMILE workflow migration execution', () => {
  it('executes twice against the required PostgreSQL relation surface', async () => {
    db = new PGlite();
    await db.exec(`
      set check_function_bodies = off;
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
        if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
      end $$;
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
      create table public.profiles(id uuid primary key, email text, status text, role text, department_id uuid, designation text, updated_at timestamptz);
      create table public.patients(id uuid primary key, archived_at timestamptz, archived_by uuid, archive_reason text, deleted_at timestamptz, updated_at timestamptz);
      create table public.doctor_appointments(id uuid primary key, created_by uuid, patient_id uuid, deleted_at timestamptz, start_at timestamptz, status text);
      create table public.finance_invoices(id uuid primary key, patient_id uuid, sale_id uuid, tax numeric default 0, discount numeric default 0, archived_at timestamptz, status text);
      create table public.patient_sessions(id uuid primary key, created_by uuid, patient_id uuid, deleted_at timestamptz);
      create table public.patient_notes(id uuid primary key, patient_id uuid, deleted_at timestamptz);
      create table public.patient_documents(id uuid primary key, patient_id uuid, deleted_at timestamptz);
      create table public.finance_invoice_items(id uuid primary key, invoice_id uuid, quantity numeric, rate numeric);
      create table public.finance_invoice_payments(id uuid primary key, invoice_id uuid, received_by uuid);
      create table public.crm_leads(id uuid primary key, converted_at timestamptz, converted_patient_id uuid);
      create table public.outsourced_doctors(id uuid primary key);
      create or replace function public.patient_access(uuid) returns boolean language sql stable as $$ select true $$;
    `);

    await expect(db.exec(migration)).resolves.toBeDefined();
    await expect(db.exec(migration)).resolves.toBeDefined();
    const result = await db.query<{ count: number }>("select count(*)::int count from information_schema.columns where table_schema='public' and table_name='patient_sessions' and column_name in ('session_fee','invoice_id','idempotency_key','currency')");
    expect(result.rows[0].count).toBe(4);

    await db.exec(`
      alter table public.profiles add column is_employee boolean default true, add column workforce_visible boolean default true;
      alter table public.crm_leads add column lead_date date, add column full_name text, add column phone text, add column gender text,
        add column profession text, add column reason_for_enquiry text, add column location text, add column source_id uuid,
        add column status_id uuid, add column temperature text, add column remarks text, add column assigned_to uuid, add column created_by uuid;
      create table public.crm_lead_sources(id uuid primary key, is_active boolean);
      create table public.crm_lead_statuses(id uuid primary key);
      create table public.tasks(id uuid primary key default gen_random_uuid(), title text, description text, priority text, due_date date, created_by uuid, assignee_id uuid, status text);
      create table public.task_assignments(task_id uuid, profile_id uuid, status text);
      create table public.finance_accounts(id uuid primary key, is_active boolean);
      create table public.finance_expense_categories(id uuid primary key, name text, is_active boolean);
      create table public.finance_transactions(id uuid primary key default gen_random_uuid(), transaction_type text, account_id uuid, expense_category_id uuid, expense_subcategory text, amount numeric, transaction_date date, payment_method text, reference_number text, counterparty_name text, description text, created_by uuid);
      alter table public.doctor_appointments add column doctor_id uuid, add column end_at timestamptz, add column consultation_type text,
        add column remarks text, add column updated_by uuid;
      alter table public.outsourced_doctors add column archived_at timestamptz, add column status text;
      create table public.doctor_appointment_activity(appointment_id uuid, actor_id uuid, action text, previous_status text, next_status text, previous_start_at timestamptz, next_start_at timestamptz, remarks text);
      create or replace function public.current_role() returns text language sql stable as $$ select 'staff'::text $$;
      create or replace function public.can_manage_task_assignment(uuid,uuid) returns boolean language sql stable as $$ select true $$;
      create or replace function public.appointment_patient_access(action text,target_patient uuid) returns boolean language sql stable as $$ select true $$;
      create or replace function public.doctor_slot_is_available(uuid,timestamptz,timestamptz,uuid) returns boolean language sql stable as $$ select true $$;
      create or replace function public.log_doctor_appointment_patient_activity(uuid,uuid,text,uuid,jsonb) returns void language sql as $$ select $$;
      create or replace function public.notify_user(uuid,text,text,text,uuid,text,uuid,text,text,text,boolean,jsonb) returns void language sql as $$ select $$;
      set check_function_bodies = on;
    `);
    const confirmationFunction = migration.match(/create or replace function public\.confirm_genie_action\([\s\S]*?\n\$\$;/)?.[0];
    expect(confirmationFunction).toBeTruthy();
    await expect(db.exec(confirmationFunction!)).resolves.toBeDefined();
    for (const functionName of ['create_doctor_appointment', 'update_doctor_appointment']) {
      const definition = migration.match(new RegExp(`create or replace function public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`))?.[0];
      expect(definition).toBeTruthy();
      await expect(db.exec(definition!)).resolves.toBeDefined();
    }
  }, 30_000);
});
