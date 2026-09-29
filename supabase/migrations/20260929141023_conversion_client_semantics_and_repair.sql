-- A CRM sale and a lead-to-client conversion are separate business events.
-- Sale creation keeps its finance lifecycle, but only a proven patient FK
-- identifies a converted client. Historical repair is explicit and dry-run by
-- default; this migration does not repair any production row automatically.

create or replace function public.convert_crm_lead_to_sale_with_payment(
  target_lead uuid,
  sale_amount numeric,
  payment_received numeric default 0,
  receiving_account uuid default null,
  payment_method text default null,
  payment_date date default null,
  payment_reference text default null,
  invoice_due_date date default null,
  sale_currency text default 'INR',
  sale_closing_date date default current_date,
  sale_service_details text default null,
  sale_first_session_date date default null,
  sale_second_session_date date default null,
  sale_third_session_date date default null,
  sale_notes text default null
)
returns public.crm_sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.crm_leads%rowtype;
  sale_row public.crm_sales%rowtype;
  invoice_row public.finance_invoices%rowtype;
  paid_amount numeric := coalesce(payment_received, 0);
  balance_due numeric;
  effective_closing_date date := coalesce(sale_closing_date, public.business_today());
  invoice_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if sale_amount is null or sale_amount < 0 then
    raise exception 'Sale amount must be zero or greater.' using errcode = '22023';
  end if;
  if paid_amount < 0 then
    raise exception 'Payment received must be zero or greater.' using errcode = '22023';
  end if;
  if paid_amount > sale_amount then
    raise exception 'Payment received cannot exceed the sale amount.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(sale_currency, '')), '') is null then
    raise exception 'Sale currency is required.' using errcode = '22023';
  end if;

  balance_due := sale_amount - paid_amount;
  if balance_due > 0 and invoice_due_date is null then
    raise exception 'Invoice due date is required when a balance remains.' using errcode = '22023';
  end if;
  if invoice_due_date is not null and invoice_due_date < effective_closing_date then
    raise exception 'Invoice due date cannot be earlier than the sale date.' using errcode = '22023';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = target_lead and archived_at is null
  for update;

  if not found
    or not public.crm_lead_can_edit(lead_row.assigned_to)
    or not (public.has_permission('crm.manage_all') or public.has_permission('sales.edit'))
  then
    raise exception 'Permission denied for lead conversion' using errcode = '42501';
  end if;

  select * into sale_row
  from public.crm_sales
  where lead_id = target_lead;

  if found then
    return sale_row;
  end if;

  if paid_amount > 0 then
    if not (
      public.has_permission('invoices.manage')
      or public.has_permission('finance.manage')
    ) then
      raise exception 'Permission denied for recording payment' using errcode = '42501';
    end if;
    if receiving_account is null or not exists(
      select 1 from public.finance_accounts
      where id = receiving_account and is_active
    ) then
      raise exception 'Choose an active receiving account.' using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(payment_method, '')), '') is null then
      raise exception 'Payment method is required.' using errcode = '22023';
    end if;
  end if;

  insert into public.crm_sales(
    lead_id, closing_date, sale_value, currency, service_details,
    first_session_date, second_session_date, third_session_date, notes, created_by
  ) values (
    target_lead, effective_closing_date, sale_amount, upper(btrim(sale_currency)),
    nullif(btrim(coalesce(sale_service_details, '')), ''),
    sale_first_session_date, sale_second_session_date, sale_third_session_date,
    nullif(btrim(coalesce(sale_notes, '')), ''), (select auth.uid())
  )
  returning * into sale_row;

  invoice_status := case
    when paid_amount >= sale_amount and sale_amount > 0 then 'paid'
    when paid_amount > 0 then 'partially_paid'
    when invoice_due_date < public.business_today() then 'overdue'
    else 'sent'
  end;

  insert into public.finance_invoices(
    invoice_number, sale_id, patient_id, customer_name, customer_phone,
    issue_date, due_date, discount, tax, notes, status, currency, created_by
  ) values (
    'SALE-' || replace(sale_row.id::text, '-', ''),
    sale_row.id, lead_row.converted_patient_id, lead_row.full_name, lead_row.phone,
    effective_closing_date, invoice_due_date, 0, 0,
    nullif(btrim(coalesce(sale_notes, '')), ''), invoice_status,
    upper(btrim(sale_currency)), (select auth.uid())
  )
  returning * into invoice_row;

  insert into public.finance_invoice_items(invoice_id, description, quantity, rate)
  values(
    invoice_row.id,
    coalesce(nullif(btrim(coalesce(sale_service_details, '')), ''), 'CRM sale'),
    1,
    sale_amount
  );

  if paid_amount > 0 then
    insert into public.finance_invoice_payments(
      invoice_id, account_id, amount, payment_date, payment_method,
      reference_number, received_by, conversion_sale_id
    ) values (
      invoice_row.id, receiving_account, paid_amount,
      coalesce(payment_date, public.business_today()), btrim(payment_method),
      nullif(btrim(coalesce(payment_reference, '')), ''), (select auth.uid()), sale_row.id
    );
  end if;

  update public.finance_invoices
  set status = invoice_status, updated_at = now()
  where id = invoice_row.id;

  -- Sale creation never manufactures a client-conversion timestamp. A real
  -- client link keeps its existing timestamp unchanged.
  update public.crm_leads
  set converted_at = case
        when converted_patient_id is null then null
        else converted_at
      end,
      updated_at = now()
  where id = target_lead;

  return sale_row;
end
$$;

revoke all on function public.convert_crm_lead_to_sale_with_payment(
  uuid,numeric,numeric,uuid,text,date,text,date,text,date,text,date,date,date,text
) from public, anon;
grant execute on function public.convert_crm_lead_to_sale_with_payment(
  uuid,numeric,numeric,uuid,text,date,text,date,text,date,text,date,date,date,text
) to authenticated;

-- The dashboard's converted metric means converted to an actual client.
create or replace function public.crm_dashboard_summary(period_start date, period_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_leads as (
    select
      lead.id,
      coalesce(lead.lead_date, lead.created_at::date) as opened_on,
      case
        when lead.converted_patient_id is not null then lead.converted_at::date
        else null
      end as converted_on,
      lead.status_id,
      status.name as status_name,
      lead.source_id,
      source.name as source_name
    from public.crm_leads lead
    left join public.crm_lead_statuses status on status.id = lead.status_id
    left join public.crm_lead_sources source on source.id = lead.source_id
    where lead.archived_at is null
  ), period_leads as (
    select * from visible_leads
    where opened_on between period_start and period_end
  ), converted_leads as (
    select * from visible_leads
    where converted_on between period_start and period_end
  ), daily_rows as (
    select day,
      count(*) filter (where kind = 'lead')::integer as leads,
      count(*) filter (where kind = 'converted')::integer as converted
    from (
      select opened_on as day, 'lead'::text as kind from period_leads
      union all
      select converted_on as day, 'converted'::text as kind from converted_leads
    ) activity
    group by day
    order by day
  ), status_rows as (
    select coalesce(status_name, 'Unassigned') as name, count(*)::integer as count
    from period_leads group by coalesce(status_name, 'Unassigned')
  ), source_rows as (
    select coalesce(source_name, 'Unassigned') as name, count(*)::integer as count
    from period_leads group by coalesce(source_name, 'Unassigned')
  ), followup_counts as (
    select
      count(*) filter (where followup.outcome is null and followup.next_follow_up_at::date = (now() at time zone 'Asia/Kolkata')::date)::integer as due,
      count(*) filter (where followup.outcome is null and followup.next_follow_up_at::date < (now() at time zone 'Asia/Kolkata')::date)::integer as overdue,
      count(*) filter (where followup.outcome is null and followup.next_follow_up_at::date > (now() at time zone 'Asia/Kolkata')::date)::integer as upcoming,
      count(*) filter (where followup.outcome is not null and followup.created_at::date between period_start and period_end)::integer as completed
    from public.crm_lead_followups followup
    join visible_leads lead on lead.id = followup.lead_id
  ), finance_permission as (
    select public.has_permission('finance.dashboard.view') or public.has_permission('finance.view') as allowed
  ), finance_totals as (
    select
      coalesce(sum(transaction.amount) filter (where transaction.transaction_type in ('income', 'invoice_payment')), 0) as revenue,
      coalesce(sum(transaction.amount) filter (where transaction.transaction_type in ('expense', 'payroll_payment')), 0) as expenses
    from public.finance_transactions transaction, finance_permission permission
    where permission.allowed
      and transaction.archived_at is null
      and transaction.transaction_date::date between period_start and period_end
  )
  select jsonb_build_object(
    'periodLeads', (select count(*) from period_leads),
    'converted', (select count(*) from converted_leads),
    'contacted', (select count(*) from period_leads where status_name ~* 'contact'),
    'assessment', (select count(*) from period_leads where status_name ~* 'assessment'),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'leads', leads, 'converted', converted) order by day) from daily_rows), '[]'::jsonb),
    'statuses', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count) order by name) from status_rows), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count) order by name) from source_rows), '[]'::jsonb),
    'followups', jsonb_build_object(
      'due', coalesce((select due from followup_counts), 0),
      'overdue', coalesce((select overdue from followup_counts), 0),
      'upcoming', coalesce((select upcoming from followup_counts), 0),
      'completed', coalesce((select completed from followup_counts), 0)
    ),
    'financeAllowed', (select allowed from finance_permission),
    'revenue', coalesce((select revenue from finance_totals), 0),
    'expenses', coalesce((select expenses from finance_totals), 0)
  )
$$;

revoke all on function public.crm_dashboard_summary(date, date) from public, anon;
grant execute on function public.crm_dashboard_summary(date, date) to authenticated;

-- Repair one explicitly approved historical row. The default is a read-only
-- plan. A real run is allowed only for a stable lead UUID and an approved,
-- unique Client ID. Existing sale/finance identities are verified unchanged.
create or replace function public.repair_converted_lead_client_linkage(
  target_lead uuid,
  approved_patient_number text,
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
  sale_ids_before jsonb;
  invoice_ids_before jsonb;
  payment_ids_before jsonb;
  ledger_rows_before jsonb;
  sale_ids_after jsonb;
  invoice_ids_after jsonb;
  payment_ids_after jsonb;
  ledger_rows_after jsonb;
begin
  if (select auth.uid()) is null
    or not public.has_permission('crm.manage_all')
    or not public.has_permission('patients.create') then
    raise exception 'You do not have permission to repair converted-client linkage.' using errcode = '42501';
  end if;

  if target_lead is null or nullif(btrim(approved_patient_number), '') is null then
    raise exception 'An explicit lead ID and approved Client ID are required.' using errcode = '22023';
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

    if linked_patient.id is not null
      and linked_patient.patient_number = btrim(approved_patient_number) then
      return jsonb_build_object(
        'mode', case when execute_repair then 'execute' else 'dry_run' end,
        'status', 'already_repaired',
        'lead_id', lead_row.id,
        'patient_id', linked_patient.id,
        'patient_number', linked_patient.patient_number,
        'converted_at', lead_row.converted_at
      );
    end if;

    raise exception 'Lead already has a different client relationship.' using errcode = '23505';
  end if;

  if lead_row.converted_at is null then
    raise exception 'Lead is not a historical sale-only conversion requiring repair.' using errcode = '22023';
  end if;

  if exists(
    select 1 from public.patients
    where patient_number = btrim(approved_patient_number)
  ) then
    raise exception 'That Client ID is already in use. Choose a different approved ID.' using errcode = '23505';
  end if;

  historical_converted_at := lead_row.converted_at;

  select coalesce(jsonb_agg(sale.id order by sale.id), '[]'::jsonb)
  into sale_ids_before
  from public.crm_sales sale
  where sale.lead_id = lead_row.id;

  select coalesce(jsonb_agg(invoice.id order by invoice.id), '[]'::jsonb)
  into invoice_ids_before
  from public.finance_invoices invoice
  join public.crm_sales sale on sale.id = invoice.sale_id
  where sale.lead_id = lead_row.id;

  select coalesce(jsonb_agg(payment.id order by payment.id), '[]'::jsonb)
  into payment_ids_before
  from public.finance_invoice_payments payment
  join public.finance_invoices invoice on invoice.id = payment.invoice_id
  join public.crm_sales sale on sale.id = invoice.sale_id
  where sale.lead_id = lead_row.id;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', transaction.id, 'amount', transaction.amount)
    order by transaction.id
  ), '[]'::jsonb)
  into ledger_rows_before
  from public.finance_transactions transaction
  join public.finance_invoices invoice on invoice.id = transaction.invoice_id
  join public.crm_sales sale on sale.id = invoice.sale_id
  where sale.lead_id = lead_row.id;

  if not execute_repair then
    return jsonb_build_object(
      'mode', 'dry_run',
      'status', 'ready',
      'lead_id', lead_row.id,
      'approved_patient_number', btrim(approved_patient_number),
      'converted_at', historical_converted_at,
      'sale_ids', sale_ids_before,
      'invoice_ids', invoice_ids_before,
      'payment_ids', payment_ids_before,
      'ledger_rows', ledger_rows_before,
      'proposed_action', 'create_one_patient_and_link_existing_finance'
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
    raise exception 'Lead gender must be Male or Female, or left blank.' using errcode = '22023';
  end if;

  insert into public.patients(
    patient_number, full_name, phone, gender, address,
    source, status, tags, created_by
  ) values (
    btrim(approved_patient_number), lead_row.full_name, lead_row.phone,
    patient_gender, nullif(btrim(lead_row.location), ''), patient_source,
    'active', array['converted_lead'], (select auth.uid())
  )
  returning * into new_patient;

  context_note := concat_ws(E'\n',
    'Converted from CRM lead on ' || to_char(historical_converted_at, 'YYYY-MM-DD HH24:MI TZ'),
    nullif('Reason for enquiry: ' || nullif(btrim(lead_row.reason_for_enquiry), ''), 'Reason for enquiry: '),
    nullif('Lead notes: ' || nullif(btrim(lead_row.remarks), ''), 'Lead notes: ')
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
      'preserved_converted_at', historical_converted_at
    )
  );

  select coalesce(jsonb_agg(sale.id order by sale.id), '[]'::jsonb)
  into sale_ids_after
  from public.crm_sales sale
  where sale.lead_id = lead_row.id;

  select coalesce(jsonb_agg(invoice.id order by invoice.id), '[]'::jsonb)
  into invoice_ids_after
  from public.finance_invoices invoice
  join public.crm_sales sale on sale.id = invoice.sale_id
  where sale.lead_id = lead_row.id;

  select coalesce(jsonb_agg(payment.id order by payment.id), '[]'::jsonb)
  into payment_ids_after
  from public.finance_invoice_payments payment
  join public.finance_invoices invoice on invoice.id = payment.invoice_id
  join public.crm_sales sale on sale.id = invoice.sale_id
  where sale.lead_id = lead_row.id;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', transaction.id, 'amount', transaction.amount)
    order by transaction.id
  ), '[]'::jsonb)
  into ledger_rows_after
  from public.finance_transactions transaction
  join public.finance_invoices invoice on invoice.id = transaction.invoice_id
  join public.crm_sales sale on sale.id = invoice.sale_id
  where sale.lead_id = lead_row.id;

  if sale_ids_after is distinct from sale_ids_before
    or invoice_ids_after is distinct from invoice_ids_before
    or payment_ids_after is distinct from payment_ids_before
    or ledger_rows_after is distinct from ledger_rows_before then
    raise exception 'Repair changed existing sale or finance identities; transaction rolled back.';
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
    'sale_ids', sale_ids_after,
    'invoice_ids', invoice_ids_after,
    'payment_ids', payment_ids_after,
    'ledger_rows', ledger_rows_after
  );
end
$$;

revoke all on function public.repair_converted_lead_client_linkage(uuid, text, boolean)
from public, anon, authenticated;
grant execute on function public.repair_converted_lead_client_linkage(uuid, text, boolean)
to authenticated;

notify pgrst, 'reload schema';
