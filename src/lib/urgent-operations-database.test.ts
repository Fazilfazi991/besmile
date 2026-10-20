import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor_id', true), '')::uuid $$;
    create function public.has_permission(code text) returns boolean language sql stable as $$
      select code = any(string_to_array(current_setting('test.permissions', true), ',')) $$;
    create function public.in_management_tree(target uuid) returns boolean language sql stable as $$
      select target = nullif(current_setting('test.subordinate', true), '')::uuid $$;
    create table profiles(id uuid primary key, status text, login_enabled boolean default true,
      is_employee boolean default true, workforce_visible boolean default true,
      onboarding_required boolean default false, removed_at timestamptz, department_id uuid);
    create table daily_work_updates(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id),
      work_date date, summary text, unique(profile_id, work_date));
    alter table daily_work_updates enable row level security;
    grant usage on schema public, auth to authenticated;
    grant select on profiles to authenticated;
    grant select, insert, update on daily_work_updates to authenticated;
    create table permissions(id uuid primary key default gen_random_uuid(), code text unique, description text);
    create table audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid, action text,
      entity_type text, entity_id uuid, before_data jsonb, after_data jsonb);
    create table finance_accounts(id uuid primary key, name text, is_active boolean, currency text);
    create table finance_expense_categories(id uuid primary key, name text unique, is_active boolean);
    create table finance_transactions(id uuid primary key default gen_random_uuid(), transaction_type text,
      account_id uuid references finance_accounts(id), expense_category_id uuid references finance_expense_categories(id),
      amount numeric(14,2) check(amount > 0), transaction_date date, payment_method text, expense_subcategory text,
      description text, reference_number text, created_by uuid, archived_at timestamptz,
      updated_at timestamptz not null default now());
    alter table finance_transactions enable row level security;
    grant select, insert, update on finance_transactions to authenticated;
    create policy finance_existing_access on finance_transactions for all to authenticated
      using(public.has_permission('finance.view')) with check(public.has_permission('finance.manage'));
    create table holiday_calendar_events(id uuid primary key, title text, year integer, start_date date,
      end_date date, source_key text unique, event_type text, is_non_working_day boolean, updated_at timestamptz default now());
    create table holidays(id uuid primary key, name text, holiday_date date);
    insert into profiles(id,status,department_id) values
      ('${id(1)}','probation','${id(90)}'),('${id(2)}','active','${id(90)}'),
      ('${id(3)}','intern','${id(91)}'),('${id(4)}','inactive','${id(90)}'),
      ('${id(5)}','terminated','${id(90)}'),('${id(6)}','resigned','${id(90)}'),
      ('${id(7)}','active','${id(90)}'),('${id(8)}','active','${id(90)}'),
      ('${id(9)}','active','${id(90)}'),('${id(10)}','active','${id(90)}'),('${id(11)}','active','${id(90)}');
    update profiles set is_employee = false where id = '${id(7)}';
    update profiles set login_enabled = false where id = '${id(8)}';
    update profiles set onboarding_required = true where id = '${id(9)}';
    update profiles set workforce_visible = false where id = '${id(10)}';
    update profiles set removed_at = now() where id = '${id(11)}';
    insert into finance_accounts values ('${id(20)}','Bank',true,'INR'),('${id(21)}','Old account',false,'INR');
    insert into finance_expense_categories values ('${id(30)}','Marketing',true),('${id(31)}','Other',true);
    insert into holiday_calendar_events values
      ('${id(40)}','Dussehra',2026,'2026-10-24','2026-10-24','2026-10-24-dussehra','holiday',true,'2026-01-01'),
      ('${id(41)}','Dussehra',2027,'2027-10-08','2027-10-08','2027-10-08-dussehra','holiday',true,'2026-01-01');
    insert into holidays values ('${id(42)}','Dussehra','2026-10-20'),('${id(43)}','Dussehra','2027-10-09');
  `);
  await db.exec(migration('20261020030000_urgent_daily_work_operational_statuses.sql'));
  await db.exec(`create policy daily_read on daily_work_updates for select to authenticated using(public.can_review_daily_work(profile_id));`);
  const financeWorkflow = migration('0023_finance_workflow_completion.sql');
  await db.exec(financeWorkflow.slice(financeWorkflow.indexOf('create or replace function public.finance_audit_event()'), financeWorkflow.indexOf('do $$ declare item text;')));
  await db.exec('create trigger finance_transactions_audit after insert or update or delete on finance_transactions for each row execute function finance_audit_event()');
  await db.exec(migration('20261020030002_crm_daily_marketing_spend.sql'));
}, 30_000);
afterAll(async () => { await db?.close(); });

async function actor(n: number, permissions = '') {
  await db.exec(`reset role; set test.actor_id = '${id(n)}'; set test.permissions = '${permissions}'; set role authenticated;`);
}
async function scalar<T>(sql: string) { return (await db.query<{ value: T }>(sql)).rows[0].value; }
const saveSpend = (amount = 400, expected: string | null = null, account = id(20), subtype = 'Performance Marketing Expenses', details = 'Ad spend') =>
  `select public.save_daily_marketing_spend('2026-10-20',${amount},'${subtype}','${account}','upi','${details}','ref',${expected ? `'${expected}'` : 'null'}) as value`;

describe('urgent operational database boundaries', () => {
  it('prepares only the two booking permissions for exact identities and rejects identity drift', async () => {
    const fixture = new PGlite();
    try {
      const fatimas = ['04f7ade2-99ee-43d1-b4c0-de2cd168fc39', '28516281-ec1c-4902-a786-346e1a51f001'];
      await fixture.exec(`
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor_id',true),'')::uuid $$;
        create table auth.users(id uuid primary key,email text,deleted_at timestamptz,email_confirmed_at timestamptz default now(),banned_until timestamptz);
        create table profiles(id uuid primary key,full_name text,email text,is_employee boolean default true,
          workforce_visible boolean default true,login_enabled boolean default true,removed_at timestamptz,
          onboarding_required boolean default false,status text default 'active',designation text default 'Sales Coordinator');
        create table permissions(id uuid primary key default gen_random_uuid(),code text unique);
        create table user_permission_grants(id uuid primary key default gen_random_uuid(),profile_id uuid,
          permission_id uuid,reason text,revoked_at timestamptz,starts_at timestamptz default now(),expires_at timestamptz);
        insert into profiles(id,full_name,email) values
          ('${fatimas[0]}','Fatima Suhara','salesheadbsmile@gmail.com'),
          ('${fatimas[1]}','Fatima KR','marketingcobsmile@gmail.com'),
          ('${id(80)}','Normal Sales','normal-sales@example.test');
        insert into auth.users(id,email) select id,email from profiles;
        insert into permissions(code) values ('doctor_scheduling.view'),('doctor_scheduling.create_appointments'),
          ('appointments.create'),('appointments.cancel'),('appointments.update'),('appointments.delete'),('clinical_notes.view');
        create function has_permission(permission_code text) returns boolean language sql stable as $$
          select exists(select 1 from user_permission_grants g join permissions p on p.id=g.permission_id
            where g.profile_id=auth.uid() and p.code=permission_code and g.revoked_at is null) $$;
      `);
      const actions = migration('0084_patient_appointment_actions_and_access.sql');
      await fixture.exec(actions.slice(actions.indexOf('create or replace function public.appointment_has_permission('), actions.indexOf('create or replace function public.appointment_patient_access(')));
      const grants = readFileSync('supabase/release/urgent_operations_booking_grants.sql','utf8');
      await fixture.exec(grants);
      await fixture.exec(grants);
      const assigned = await fixture.query<{ profile_id: string; code: string }>(`select g.profile_id,p.code from user_permission_grants g join permissions p on p.id=g.permission_id order by g.profile_id,p.code`);
      expect(assigned.rows).toHaveLength(4);
      expect(new Set(assigned.rows.map(row => row.code))).toEqual(new Set(['doctor_scheduling.view','doctor_scheduling.create_appointments']));
      for (const person of fatimas) {
        await fixture.exec(`set test.actor_id='${person}'`);
        expect((await fixture.query(`select appointment_has_permission('view') as view,appointment_has_permission('create') as create,
          appointment_has_permission('update') as update,appointment_has_permission('cancel') as cancel,
          appointment_has_permission('delete') as delete,appointment_has_permission('reschedule') as reschedule,
          has_permission('clinical_notes.view') as notes`)).rows[0]).toEqual({view:true,create:true,update:false,cancel:false,delete:false,reschedule:false,notes:false});
      }
      await fixture.exec(`set test.actor_id='${id(80)}'`);
      expect((await fixture.query(`select appointment_has_permission('create') as allowed`)).rows[0]).toEqual({allowed:false});
      await fixture.exec(`update auth.users set email='different@example.test' where id='${fatimas[0]}'`);
      await expect(fixture.exec(grants)).rejects.toThrow(/identities must pass/i);
      await fixture.exec('rollback');
    } finally { await fixture.close(); }
  }, 30_000);

  it('allows probation, active and intern owner writes, edits and one row per date', async () => {
    for (const n of [1, 2, 3]) {
      await actor(n);
      await db.exec(`insert into daily_work_updates(profile_id,work_date,summary) values ('${id(n)}','2026-10-20','Initial');`);
      expect(await scalar<number>(`with edited as (update daily_work_updates set summary='Updated' where profile_id='${id(n)}' returning id) select count(*)::int value from edited`)).toBe(1);
      await expect(db.exec(`insert into daily_work_updates(profile_id,work_date,summary) values ('${id(n)}','2026-10-20','Duplicate');`)).rejects.toThrow(/unique/i);
    }
  });

  it('denies inactive, terminated, resigned, external, login-disabled, onboarding and removed profiles', async () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10, 11]) {
      await actor(n);
      await expect(db.exec(`insert into daily_work_updates(profile_id,work_date,summary) values ('${id(n)}','2026-10-20','Forbidden');`)).rejects.toThrow(/row-level security/i);
    }
  });

  it('never lets another employee edit the owner, including department reviewers', async () => {
    await actor(2, 'daily_work.review_department');
    expect(await scalar<number>(`select count(*)::int value from daily_work_updates where profile_id='${id(1)}'`)).toBe(1);
    expect(await scalar<number>(`with edited as (update daily_work_updates set summary='Forbidden' where profile_id='${id(1)}' returning id) select count(*)::int value from edited`)).toBe(0);
    expect(await scalar<boolean>(`select can_review_daily_work('${id(3)}') value`)).toBe(false);
    await actor(2, 'attendance.view');
    await db.exec(`set test.subordinate = '${id(3)}'`);
    expect(await scalar<boolean>(`select can_review_daily_work('${id(3)}') value`)).toBe(true);
    expect(await scalar<boolean>(`select can_review_daily_work('${id(1)}') value`)).toBe(false);
  });

  it('writes one actual finance expense, makes retries safe, prevents stale edits and preserves unrelated expenses', async () => {
    await actor(2, 'crm.marketing_spend.manage');
    const first = await scalar<string>(saveSpend());
    expect(await scalar<string>(saveSpend())).toBe(first);
    expect(await scalar<number>('select count(*)::int value from finance_transactions')).toBe(0); // no broad finance read
    await expect(db.exec(`insert into finance_transactions(amount) values (999)`)).rejects.toThrow(/row-level security/i);
    const options = await scalar<{ entries: { updated_at: string }[] }>(`select daily_marketing_spend_options('2026-10-20') value`);
    const version = options.entries[0].updated_at;
    expect(await scalar<string>(saveSpend(500, version))).toBe(first);
    expect(await scalar<string>(saveSpend(500, version))).toBe(first);
    await expect(db.query(saveSpend(600, version))).rejects.toThrow(/changed/i);
    await db.exec(`reset role; insert into finance_transactions(id,transaction_type,account_id,expense_category_id,amount,transaction_date,payment_method,expense_subcategory)
      values ('${id(50)}','expense','${id(20)}','${id(30)}',100,'2026-10-20','cash','Performance Marketing Expenses');`);
    expect(await scalar<number>(`select count(*)::int value from finance_transactions where crm_daily_marketing`)).toBe(1);
    expect(Number(await scalar<string>(`select sum(amount) value from finance_transactions`))).toBe(600);
    expect(Number(await scalar<string>(`select amount value from finance_transactions where id='${id(50)}'`))).toBe(100);
    const audit = await db.query<{ actor_id: string; before_data: {amount:number} | null; after_data:{amount:number} }>(
      `select actor_id,before_data,after_data from audit_logs where entity_id='${first}' order by before_data is null desc`);
    expect(audit.rows).toHaveLength(2); // duplicate retries do not produce another event
    expect(audit.rows[0].actor_id).toBe(id(2));
    expect(audit.rows[0].before_data).toBeNull();
    expect(audit.rows[0].after_data.amount).toBe(400);
    expect(audit.rows[1].before_data?.amount).toBe(400);
    expect(audit.rows[1].after_data.amount).toBe(500);
  });

  it('rejects unauthorized entry, invalid subtypes, inactive accounts, missing Other description and invalid amounts', async () => {
    await actor(1);
    await expect(db.query(saveSpend())).rejects.toThrow(/permission required/i);
    await actor(2, 'crm.marketing_spend.manage');
    await expect(db.query(saveSpend(0))).rejects.toThrow(/positive amount/i);
    await expect(db.query(saveSpend(1.111))).rejects.toThrow(/two decimals/i);
    await expect(db.query(saveSpend(400, null, id(21)))).rejects.toThrow(/active INR/i);
    await expect(db.query(saveSpend(400, null, id(20), 'Other Marketing Expenses', ''))).rejects.toThrow(/Describe/i);
    await expect(db.query(saveSpend(400, null, id(20), 'Rent'))).rejects.toThrow(/Marketing subtype/i);
    await expect(db.query(saveSpend().replace("'2026-10-20'", "'2999-01-01'"))).rejects.toThrow(/valid business date/i);
    const missedDay = saveSpend(37.49).replace("'2026-10-20'", "'2026-10-19'");
    const missedId = await scalar<string>(missedDay);
    const missedOptions = await scalar<{entries:{amount:number;updated_at:string}[]}>(`select daily_marketing_spend_options('2026-10-19') value`);
    expect(missedOptions.entries[0].amount).toBe(37.49);
    expect(await scalar<string>(saveSpend(12345.67, missedOptions.entries[0].updated_at).replace("'2026-10-20'", "'2026-10-19'"))).toBe(missedId);
    for (const n of [4, 7, 8, 9, 10, 11]) {
      await actor(n, 'crm.marketing_spend.manage');
      await expect(db.query(saveSpend())).rejects.toThrow(/permission required/i);
    }
  });

  it('preserves the Dussehra ID, legacy rows and every 2027 field, and refuses duplicates', async () => {
    await db.exec('reset role');
    const before2027 = await db.query(`select * from holiday_calendar_events where year=2027`);
    const legacy = await db.query('select * from holidays order by id');
    const sql = migration('20261020030001_urgent_dussehra_2026.sql');
    await db.exec(sql);
    expect((await db.query(`select id,start_date::text,end_date::text,is_non_working_day from holiday_calendar_events where year=2026`)).rows).toEqual([
      { id: id(40), start_date: '2026-10-20', end_date: '2026-10-20', is_non_working_day: true },
    ]);
    expect((await db.query(`select * from holiday_calendar_events where year=2027`)).rows).toEqual(before2027.rows);
    expect((await db.query('select * from holidays order by id')).rows).toEqual(legacy.rows);
    await db.exec(`insert into holiday_calendar_events(id,title,year) values ('${id(44)}','Dussehra',2026)`);
    await expect(db.exec(sql)).rejects.toThrow(/exactly one/i);
    await db.exec('rollback');
  });
});
