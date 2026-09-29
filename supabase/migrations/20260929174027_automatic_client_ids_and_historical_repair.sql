-- Canonical BSMILE client IDs are allocated transactionally in PostgreSQL.
-- Existing patient_number values are never changed. Only IDs matching the
-- canonical BSM + five digit format initialize or advance this counter.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.client_number_counters (
  prefix text primary key,
  last_value bigint not null check (last_value >= 0),
  updated_at timestamptz not null default now(),
  constraint client_number_counters_supported_prefix check (prefix = 'BSM')
);

revoke all on table private.client_number_counters from public, anon, authenticated;

insert into private.client_number_counters(prefix, last_value)
select
  'BSM',
  coalesce(max(substring(patient_number from 4)::integer), 0)
from public.patients
where patient_number ~ '^BSM[0-9]{5}$'
on conflict (prefix) do update
set last_value = greatest(
      private.client_number_counters.last_value,
      excluded.last_value
    ),
    updated_at = now();

create or replace function private.allocate_next_client_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actual_max integer;
  allocated_value bigint;
begin
  select coalesce(max(substring(patient_number from 4)::integer), 0)
  into actual_max
  from public.patients
  where patient_number ~ '^BSM[0-9]{5}$';

  insert into private.client_number_counters(prefix, last_value, updated_at)
  values ('BSM', actual_max + 1, now())
  on conflict (prefix) do update
  set last_value = greatest(
        private.client_number_counters.last_value,
        excluded.last_value - 1
      ) + 1,
      updated_at = now()
  returning last_value into allocated_value;

  if allocated_value > 99999 then
    raise exception 'The canonical BSM Client ID range is exhausted.'
      using errcode = '22003';
  end if;

  return 'BSM' || lpad(allocated_value::text, 5, '0');
end
$$;

revoke all on function private.allocate_next_client_number()
from public, anon, authenticated;

-- Direct client creation uses the same allocator when the caller omits the
-- number. Explicit IDs remain available for flagged QA/demo fixtures and
-- controlled imports; the normal production UI no longer supplies one.
create or replace function private.assign_client_number_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(new.patient_number), '') is null then
    new.patient_number := private.allocate_next_client_number();
  end if;
  return new;
end
$$;

revoke all on function private.assign_client_number_on_insert()
from public, anon, authenticated;

drop trigger if exists assign_client_number_on_insert on public.patients;
create trigger assign_client_number_on_insert
before insert on public.patients
for each row execute function private.assign_client_number_on_insert();

-- The authoritative conversion entry point no longer accepts a Client ID.
-- Lead locking plus the transactional counter makes concurrent conversion
-- safe. Repeating a completed request returns its existing relationship and
-- does not allocate another number or create another patient.
create or replace function public.convert_lead_to_patient(target_lead uuid)
returns table(patient_id uuid, patient_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.crm_leads%rowtype;
  new_patient public.patients%rowtype;
  linked_patient public.patients%rowtype;
  source_name text;
  patient_source text;
  patient_gender text;
  context_note text;
  generated_patient_number text;
  management_path boolean;
begin
  management_path := public.has_permission('crm.manage_all');

  if (select auth.uid()) is null
    or not public.has_permission('patients.create')
    or not (
      management_path
      or public.has_permission('leads.convert_to_patient')
    ) then
    raise exception 'You do not have permission to convert this lead to a patient.'
      using errcode = '42501';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = target_lead and archived_at is null
  for update;

  if lead_row.id is null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if not management_path
    and not public.crm_lead_can_view(
      lead_row.assigned_to,
      lead_row.converted_patient_id
    ) then
    raise exception 'You do not have permission to convert this lead to a patient.'
      using errcode = '42501';
  end if;

  if lead_row.converted_patient_id is not null then
    select * into linked_patient
    from public.patients
    where id = lead_row.converted_patient_id;

    if linked_patient.id is null then
      raise exception 'The converted lead references a missing client.';
    end if;

    return query select linked_patient.id, linked_patient.slug;
    return;
  end if;

  select name into source_name
  from public.crm_lead_sources
  where id = lead_row.source_id;

  patient_source := case
    when source_name ilike '%website%' then 'Website'
    when source_name ilike '%walk%' then 'Walk-in'
    when source_name ilike '%referral%' then 'Referral'
    when source_name ilike '%instagram%' or source_name ilike '%social%' then 'Social media'
    else 'Other'
  end;

  if nullif(btrim(coalesce(lead_row.gender, '')), '') is null then
    patient_gender := null;
  elsif lower(btrim(lead_row.gender)) = 'male' then
    patient_gender := 'male';
  elsif lower(btrim(lead_row.gender)) = 'female' then
    patient_gender := 'female';
  else
    raise exception 'Lead gender must be Male or Female, or left blank.'
      using errcode = '22023';
  end if;

  generated_patient_number := private.allocate_next_client_number();

  insert into public.patients(
    patient_number, full_name, phone, gender, address,
    source, status, tags, created_by
  ) values (
    generated_patient_number, lead_row.full_name, lead_row.phone,
    patient_gender, nullif(btrim(lead_row.location), ''), patient_source,
    'active', array['converted_lead'], (select auth.uid())
  )
  returning * into new_patient;

  context_note := concat_ws(E'\n',
    'Converted from CRM lead on ' || to_char(now(), 'YYYY-MM-DD HH24:MI TZ'),
    nullif(
      'Reason for enquiry: ' || nullif(btrim(lead_row.reason_for_enquiry), ''),
      'Reason for enquiry: '
    ),
    nullif(
      'Lead notes: ' || nullif(btrim(lead_row.remarks), ''),
      'Lead notes: '
    )
  );

  if context_note is not null then
    insert into public.patient_notes(
      patient_id, note_type, content, visibility, created_by
    ) values (
      new_patient.id, 'administrative', context_note,
      'management_only', (select auth.uid())
    );
  end if;

  perform set_config('app.lead_conversion_target', lead_row.id::text, true);

  update public.crm_leads
  set converted_at = now(),
      converted_patient_id = new_patient.id,
      status_id = (
        select id from public.crm_lead_statuses
        where name = 'Converted'
        limit 1
      ),
      updated_at = now()
  where id = lead_row.id;

  perform set_config('app.lead_conversion_target', '', true);

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, after_data
  ) values (
    (select auth.uid()), 'lead_converted_to_patient', 'crm_lead', lead_row.id,
    jsonb_build_object(
      'patient_id', new_patient.id,
      'patient_number', new_patient.patient_number,
      'automatic_client_number', true
    )
  );

  return query select new_patient.id, new_patient.slug;
end
$$;

revoke all on function public.convert_lead_to_patient(uuid)
from public, anon, authenticated;
grant execute on function public.convert_lead_to_patient(uuid)
to authenticated;

-- Compatibility for an already-open pre-deployment browser. The caller's
-- former manual value is deliberately ignored; PostgreSQL remains the only
-- authority for the generated Client ID.
create or replace function public.convert_lead_to_patient(
  target_lead uuid,
  requested_patient_number text
)
returns table(patient_id uuid, patient_slug text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select * from public.convert_lead_to_patient(target_lead);
end
$$;

revoke all on function public.convert_lead_to_patient(uuid, text)
from public, anon, authenticated;
grant execute on function public.convert_lead_to_patient(uuid, text)
to authenticated;

-- The finance reconciliation trigger must also support an explicitly
-- reviewed repair run from the Supabase SQL editor. API callers still need an
-- authenticated identity.
create or replace function public.reconcile_converted_patient_finance(
  target_lead uuid,
  target_patient uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if (select auth.uid()) is null
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.finance_invoices invoice
  set patient_id = target_patient
  from public.crm_sales sale
  where sale.lead_id = target_lead
    and invoice.sale_id = sale.id
    and invoice.patient_id is null;

  get diagnostics changed = row_count;
  return changed;
end
$$;

revoke all on function public.reconcile_converted_patient_finance(uuid, uuid)
from public, anon, authenticated;

-- Auto-numbered historical repair. Dry-run is the default. The execute path
-- is idempotent, keeps the original converted_at value, uses the existing
-- lead -> sale -> invoice FK chain, and verifies that sale/payment/ledger
-- identities and amounts did not change.
create or replace function public.repair_converted_lead_client_linkage(
  target_lead uuid,
  execute_repair boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.crm_leads%rowtype;
  new_patient public.patients%rowtype;
  linked_patient public.patients%rowtype;
  source_name text;
  patient_source text;
  patient_gender text;
  context_note text;
  historical_converted_at timestamptz;
  generated_patient_number text;
  finance_before jsonb;
  finance_after jsonb;
begin
  if not (
    (
      (select auth.uid()) is not null
      and public.has_permission('crm.manage_all')
      and public.has_permission('patients.create')
    )
    or session_user in ('postgres', 'supabase_admin')
  ) then
    raise exception 'You do not have permission to repair converted-client linkage.'
      using errcode = '42501';
  end if;

  if target_lead is null then
    raise exception 'An explicit lead ID is required.' using errcode = '22023';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = target_lead
  for update;

  if lead_row.id is null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if lead_row.converted_patient_id is not null then
    select * into linked_patient
    from public.patients
    where id = lead_row.converted_patient_id;

    if linked_patient.id is null then
      raise exception 'Lead already references a missing client.';
    end if;

    return jsonb_build_object(
      'mode', case when execute_repair then 'execute' else 'dry_run' end,
      'status', 'already_repaired',
      'lead_id', lead_row.id,
      'patient_id', linked_patient.id,
      'patient_number', linked_patient.patient_number,
      'converted_at', lead_row.converted_at
    );
  end if;

  if lead_row.converted_at is null then
    raise exception 'Lead is not a historical broken conversion requiring repair.'
      using errcode = '22023';
  end if;

  historical_converted_at := lead_row.converted_at;

  select jsonb_build_object(
    'sales', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', sale.id, 'amount', sale.sale_value)
        order by sale.id
      )
      from public.crm_sales sale
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object('id', invoice.id) order by invoice.id)
      from public.finance_invoices invoice
      join public.crm_sales sale on sale.id = invoice.sale_id
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', payment.id, 'amount', payment.amount)
        order by payment.id
      )
      from public.finance_invoice_payments payment
      join public.finance_invoices invoice on invoice.id = payment.invoice_id
      join public.crm_sales sale on sale.id = invoice.sale_id
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', transaction.id, 'amount', transaction.amount)
        order by transaction.id
      )
      from public.finance_transactions transaction
      join public.finance_invoices invoice on invoice.id = transaction.invoice_id
      join public.crm_sales sale on sale.id = invoice.sale_id
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb)
  ) into finance_before;

  if not execute_repair then
    return jsonb_build_object(
      'mode', 'dry_run',
      'status', 'ready',
      'lead_id', lead_row.id,
      'converted_at', historical_converted_at,
      'finance', finance_before,
      'proposed_action', 'allocate_one_client_and_link_existing_finance'
    );
  end if;

  select name into source_name
  from public.crm_lead_sources
  where id = lead_row.source_id;

  patient_source := case
    when source_name ilike '%website%' then 'Website'
    when source_name ilike '%walk%' then 'Walk-in'
    when source_name ilike '%referral%' then 'Referral'
    when source_name ilike '%instagram%' or source_name ilike '%social%' then 'Social media'
    else 'Other'
  end;

  if nullif(btrim(coalesce(lead_row.gender, '')), '') is null then
    patient_gender := null;
  elsif lower(btrim(lead_row.gender)) = 'male' then
    patient_gender := 'male';
  elsif lower(btrim(lead_row.gender)) = 'female' then
    patient_gender := 'female';
  else
    raise exception 'Lead gender must be Male or Female, or left blank.'
      using errcode = '22023';
  end if;

  generated_patient_number := private.allocate_next_client_number();

  insert into public.patients(
    patient_number, full_name, phone, gender, address,
    source, status, tags, created_by
  ) values (
    generated_patient_number, lead_row.full_name, lead_row.phone,
    patient_gender, nullif(btrim(lead_row.location), ''), patient_source,
    'active', array['converted_lead'], (select auth.uid())
  )
  returning * into new_patient;

  context_note := concat_ws(E'\n',
    'Converted from CRM lead on ' ||
      to_char(historical_converted_at, 'YYYY-MM-DD HH24:MI TZ'),
    nullif(
      'Reason for enquiry: ' || nullif(btrim(lead_row.reason_for_enquiry), ''),
      'Reason for enquiry: '
    ),
    nullif(
      'Lead notes: ' || nullif(btrim(lead_row.remarks), ''),
      'Lead notes: '
    )
  );

  if context_note is not null then
    insert into public.patient_notes(
      patient_id, note_type, content, visibility, created_by
    ) values (
      new_patient.id, 'administrative', context_note,
      'management_only', (select auth.uid())
    );
  end if;

  perform set_config('app.lead_conversion_target', lead_row.id::text, true);

  update public.crm_leads
  set converted_patient_id = new_patient.id,
      converted_at = historical_converted_at,
      status_id = (
        select id from public.crm_lead_statuses
        where name = 'Converted'
        limit 1
      ),
      updated_at = now()
  where id = lead_row.id;

  perform set_config('app.lead_conversion_target', '', true);

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, after_data
  ) values (
    (select auth.uid()), 'lead_converted_to_patient', 'crm_lead', lead_row.id,
    jsonb_build_object(
      'patient_id', new_patient.id,
      'patient_number', new_patient.patient_number,
      'historical_repair', true,
      'automatic_client_number', true,
      'preserved_converted_at', historical_converted_at,
      'database_session_user', session_user
    )
  );

  select jsonb_build_object(
    'sales', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', sale.id, 'amount', sale.sale_value)
        order by sale.id
      )
      from public.crm_sales sale
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object('id', invoice.id) order by invoice.id)
      from public.finance_invoices invoice
      join public.crm_sales sale on sale.id = invoice.sale_id
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', payment.id, 'amount', payment.amount)
        order by payment.id
      )
      from public.finance_invoice_payments payment
      join public.finance_invoices invoice on invoice.id = payment.invoice_id
      join public.crm_sales sale on sale.id = invoice.sale_id
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', transaction.id, 'amount', transaction.amount)
        order by transaction.id
      )
      from public.finance_transactions transaction
      join public.finance_invoices invoice on invoice.id = transaction.invoice_id
      join public.crm_sales sale on sale.id = invoice.sale_id
      where sale.lead_id = lead_row.id
    ), '[]'::jsonb)
  ) into finance_after;

  if finance_after is distinct from finance_before then
    raise exception 'Repair changed an existing sale or finance identity/amount; transaction rolled back.';
  end if;

  if exists(
    select 1
    from public.finance_invoices invoice
    join public.crm_sales sale on sale.id = invoice.sale_id
    where sale.lead_id = lead_row.id
      and invoice.patient_id is distinct from new_patient.id
  ) then
    raise exception 'Existing sale invoice was not linked to the repaired client; transaction rolled back.';
  end if;

  return jsonb_build_object(
    'mode', 'execute',
    'status', 'repaired',
    'lead_id', lead_row.id,
    'patient_id', new_patient.id,
    'patient_number', new_patient.patient_number,
    'converted_at', historical_converted_at,
    'finance', finance_after
  );
end
$$;

revoke all on function public.repair_converted_lead_client_linkage(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.repair_converted_lead_client_linkage(uuid, boolean)
to authenticated;

-- Retire the former operator-chosen-ID overload from application roles. It is
-- kept in place only to avoid a destructive signature drop during rollout.
revoke all on function public.repair_converted_lead_client_linkage(uuid, text, boolean)
from public, anon, authenticated;

notify pgrst, 'reload schema';
