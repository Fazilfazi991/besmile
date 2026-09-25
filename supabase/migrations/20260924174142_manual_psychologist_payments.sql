-- Reuse psychologist_session_payables so manual obligations share the same
-- Finance status model, filters, and settlement ledger as generated payables.
alter table public.psychologist_session_payables
  alter column appointment_id drop not null,
  alter column session_date drop not null,
  alter column session_completed_at drop not null,
  alter column session_record_submitted_at drop not null,
  alter column psychologist_rate drop not null,
  alter column payment_cycle_type drop not null,
  add column if not exists source text not null default 'automatic'
    check (source in ('automatic', 'manual')),
  add column if not exists notes text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists psychologist_session_payables_source_idx
  on public.psychologist_session_payables(source, created_at desc);

-- Diya already has view and settle access as Assistant Manager. Give only
-- her existing staff profile the manage capability needed for manual entry.
insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile.id, permission.id, 'Manual psychologist payment entry for Diya'
from public.profiles profile
join public.permissions permission on permission.code = 'psychologist_payments.manage'
where profile.employee_code = 'A002'
  and lower(profile.email) = 'diyaassistantmanager@gmail.com'
  and profile.status = 'active'
  and not exists (
    select 1 from public.user_permission_grants existing
    where existing.profile_id = profile.id
      and existing.permission_id = permission.id
      and existing.revoked_at is null
      and existing.starts_at <= now()
      and (existing.expires_at is null or existing.expires_at > now())
  );

-- Finance viewers get a controlled directory of active psychologists without
-- requiring broad read access to clinician records. Interns are not payment
-- payees in this workflow; both staff and outsourced psychologists are valid.
create or replace function public.psychologist_payment_directory()
returns table(psychologist_id uuid, psychologist_profile_id uuid, psychologist_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.has_permission('psychologist_payments.view')
    or not public.has_permission('psychologist_payments.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return query
  select clinician.id, clinician.profile_id, clinician.doctor_name
  from public.outsourced_doctors clinician
  where clinician.clinician_type in ('outsourced', 'staff_psychologist')
    and clinician.status = 'active'
    and clinician.archived_at is null
  order by clinician.doctor_name;
end;
$$;
revoke all on function public.psychologist_payment_directory() from public, anon;
grant execute on function public.psychologist_payment_directory() to authenticated, service_role;

create or replace function public.create_manual_psychologist_payment(
  target_psychologist uuid,
  target_amount numeric,
  target_due_date date,
  target_status text default 'payment_due',
  target_paid_on date default null,
  target_notes text default null,
  target_account uuid default null,
  method text default 'bank_transfer',
  reference text default null
)
returns public.psychologist_session_payables
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician public.outsourced_doctors%rowtype;
  payable public.psychologist_session_payables%rowtype;
  category_id uuid;
  ledger_id uuid;
begin
  if (select auth.uid()) is null
    or not public.has_permission('psychologist_payments.view')
    or not public.has_permission('psychologist_payments.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target_amount is null or target_amount <= 0 or round(target_amount, 2) <= 0 or target_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a valid amount greater than zero.';
  end if;
  if target_due_date is null then raise exception 'Due date is required.'; end if;
  if target_status not in ('payment_due', 'paid') then raise exception 'Select a valid payment status.'; end if;
  if target_status = 'paid' and not public.has_permission('psychologist_payments.settle') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target_status = 'paid' and (target_paid_on is null or target_account is null) then
    raise exception 'A payment date and active Finance account are required for a paid payment.';
  end if;
  if target_status = 'paid' and method not in ('cash', 'bank_transfer', 'upi', 'card') then
    raise exception 'Select a valid payment method.';
  end if;

  select * into clinician
  from public.outsourced_doctors
  where id = target_psychologist
    and clinician_type in ('outsourced', 'staff_psychologist')
    and status = 'active'
    and archived_at is null;
  if clinician.id is null then raise exception 'Select an active psychologist.'; end if;

  insert into public.psychologist_session_payables(
    appointment_id, psychologist_id, psychologist_profile_id,
    clinician_name_snapshot, payable_amount, currency, due_date,
    payment_cycle_type, status, paid_at, paid_by, payment_reference,
    notes, source, created_by
  ) values (
    null, clinician.id, clinician.profile_id,
    clinician.doctor_name, round(target_amount, 2), 'INR', target_due_date,
    'manual', target_status,
    case when target_status = 'paid' then target_paid_on::timestamptz end,
    case when target_status = 'paid' then (select auth.uid()) end,
    nullif(btrim(reference), ''), nullif(btrim(target_notes), ''), 'manual', (select auth.uid())
  ) returning * into payable;

  if target_status = 'paid' then
    select id into category_id from public.finance_expense_categories
    where name = 'Psychologist session payout' and is_active limit 1;
    if category_id is null then raise exception 'Psychologist session payout expense category is unavailable.'; end if;
    if not exists(select 1 from public.finance_accounts where id = target_account and is_active) then
      raise exception 'Payment account is unavailable.';
    end if;
    insert into public.finance_transactions(
      transaction_type, account_id, expense_category_id, amount,
      transaction_date, payment_method, reference_number, description, created_by
    ) values (
      'psychologist_payment', target_account, category_id, round(target_amount, 2),
      target_paid_on, method, nullif(btrim(reference), ''),
      'Manual psychologist payment: ' || payable.id::text, (select auth.uid())
    ) returning id into ledger_id;
    update public.psychologist_session_payables
    set finance_transaction_id = ledger_id, updated_at = now()
    where id = payable.id returning * into payable;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values ((select auth.uid()), 'manual_psychologist_payment_created',
    'psychologist_session_payables', payable.id,
    jsonb_build_object('source', 'manual', 'psychologist_id', clinician.id,
      'amount', payable.payable_amount, 'due_date', payable.due_date,
      'status', payable.status, 'finance_transaction_id', payable.finance_transaction_id));
  return payable;
end;
$$;
revoke all on function public.create_manual_psychologist_payment(uuid, numeric, date, text, date, text, uuid, text, text) from public, anon;
grant execute on function public.create_manual_psychologist_payment(uuid, numeric, date, text, date, text, uuid, text, text) to authenticated, service_role;

create or replace function public.update_manual_psychologist_payment(
  target_payable uuid,
  target_psychologist uuid,
  target_amount numeric,
  target_due_date date,
  target_status text,
  target_notes text default null
)
returns public.psychologist_session_payables
language plpgsql
security definer
set search_path = ''
as $$
declare
  payable public.psychologist_session_payables%rowtype;
  clinician public.outsourced_doctors%rowtype;
  before_data jsonb;
begin
  if (select auth.uid()) is null
    or not public.has_permission('psychologist_payments.view')
    or not public.has_permission('psychologist_payments.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target_amount is null or target_amount <= 0 or round(target_amount, 2) <= 0 or target_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a valid amount greater than zero.';
  end if;
  if target_due_date is null then raise exception 'Due date is required.'; end if;
  if target_status not in ('payment_due', 'scheduled') then raise exception 'Select a valid pending status.'; end if;

  select * into payable from public.psychologist_session_payables
  where id = target_payable for update;
  if payable.id is null or payable.source <> 'manual'
    or payable.status not in ('payment_due', 'scheduled')
    or payable.finance_transaction_id is not null then
    raise exception 'Only unpaid manual payments can be edited.';
  end if;
  select * into clinician from public.outsourced_doctors
  where id = target_psychologist and clinician_type in ('outsourced', 'staff_psychologist')
    and status = 'active' and archived_at is null;
  if clinician.id is null then raise exception 'Select an active psychologist.'; end if;

  before_data := jsonb_build_object('psychologist_id', payable.psychologist_id,
    'amount', payable.payable_amount, 'due_date', payable.due_date,
    'status', payable.status, 'notes', payable.notes);
  update public.psychologist_session_payables
  set psychologist_id = clinician.id,
      psychologist_profile_id = clinician.profile_id,
      clinician_name_snapshot = clinician.doctor_name,
      payable_amount = round(target_amount, 2),
      due_date = target_due_date,
      status = target_status,
      notes = nullif(btrim(target_notes), ''),
      updated_at = now()
  where id = payable.id returning * into payable;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values ((select auth.uid()), 'manual_psychologist_payment_updated',
    'psychologist_session_payables', payable.id, before_data,
    jsonb_build_object('psychologist_id', payable.psychologist_id,
      'amount', payable.payable_amount, 'due_date', payable.due_date,
      'status', payable.status, 'notes', payable.notes));
  return payable;
end;
$$;
revoke all on function public.update_manual_psychologist_payment(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.update_manual_psychologist_payment(uuid, uuid, numeric, date, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
