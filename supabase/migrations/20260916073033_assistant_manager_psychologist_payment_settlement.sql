-- Assistant Managers already receive their operational capabilities through
-- one designation bundle. Extend that bundle without replacing any existing
-- CRM, sales, scheduling, or official-document grants.
with target_bundle as (
  select id
  from public.designation_permission_bundles
  where department_name = 'Administration'
    and designation = 'Assistant Manager'
    and is_active
), allowed_permissions as (
  select id
  from public.permissions
  where code in ('psychologist_payments.view', 'psychologist_payments.settle')
)
insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select target_bundle.id, allowed_permissions.id
from target_bundle cross join allowed_permissions
on conflict do nothing;

-- Settlement needs only the id and display name of active payment accounts.
-- Do not expose the finance_accounts table or grant finance administration.
create or replace function public.psychologist_payment_accounts()
returns table(id uuid, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.has_permission('psychologist_payments.settle') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return query
  select account.id, account.name
  from public.finance_accounts account
  where account.is_active
  order by account.name, account.id;
end;
$$;

revoke all on function public.psychologist_payment_accounts() from public, anon;
grant execute on function public.psychologist_payment_accounts() to authenticated, service_role;

-- This category is part of the psychologist-payable module's original seed.
-- Keep it active and preserve the Finance master-data validator: ordinary
-- expenses remain limited to their three canonical categories, while the
-- dedicated psychologist transaction type uses only its dedicated category.
insert into public.finance_expense_categories(name, is_active)
values ('Psychologist session payout', true)
on conflict (name) do update set is_active = true;

create or replace function public.validate_finance_transaction_master_data()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if not exists (
    select 1 from public.finance_accounts
    where id = new.account_id and is_active
  ) then
    raise exception 'Select an active finance account.';
  end if;

  if new.transaction_type = 'income' and not exists (
    select 1 from public.finance_income_categories
    where id = new.income_category_id and is_active
  ) then
    raise exception 'Select an active income category.';
  end if;

  if new.transaction_type in ('expense', 'payroll_payment') and not exists (
    select 1 from public.finance_expense_categories
    where id = new.expense_category_id
      and is_active
      and name in ('Capital Expense', 'Monthly Expense', 'Maintenance')
  ) then
    raise exception 'Select Capital Expense, Monthly Expense, or Maintenance.';
  end if;

  if new.transaction_type = 'psychologist_payment' and not exists (
    select 1 from public.finance_expense_categories
    where id = new.expense_category_id
      and is_active
      and name = 'Psychologist session payout'
  ) then
    raise exception 'Psychologist session payout expense category is unavailable.';
  end if;

  if new.payment_method not in ('cash', 'bank_transfer', 'upi', 'card') then
    raise exception 'Select a valid payment method.';
  end if;

  return new;
end;
$$;

-- The existing atomic RPC owns the only allowed update path. The narrow
-- settlement capability authorizes one transition and one linked ledger row;
-- it does not permit direct payable, account, or ledger mutations.
create or replace function public.settle_psychologist_session_payable(
  target_payable uuid,
  target_account uuid,
  paid_on date,
  method text,
  reference text default null
)
returns public.psychologist_session_payables
language plpgsql
security definer
set search_path = ''
as $$
declare
  payable public.psychologist_session_payables%rowtype;
  ledger_id uuid;
begin
  if (select auth.uid()) is null
    or not public.has_permission('psychologist_payments.view')
    or not public.has_permission('psychologist_payments.settle') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  select * into payable
  from public.psychologist_session_payables
  where id = target_payable
  for update;

  if payable.id is null
    or payable.status not in ('payment_due', 'scheduled')
    or payable.finance_transaction_id is not null then
    raise exception 'This payable is not available for settlement.';
  end if;

  if not exists(
    select 1 from public.finance_accounts
    where id = target_account and is_active
  ) then
    raise exception 'Payment account is unavailable.';
  end if;

  if method not in ('cash', 'bank_transfer', 'upi', 'card') then
    raise exception 'Payment method is unavailable.';
  end if;

  insert into public.finance_transactions(
    transaction_type, account_id, expense_category_id, amount,
    transaction_date, payment_method, reference_number, description, created_by
  )
  select
    'psychologist_payment', target_account, id, payable.payable_amount,
    coalesce(paid_on, public.business_today()), method,
    nullif(btrim(reference), ''),
    'Psychologist session payable: ' || payable.id::text,
    (select auth.uid())
  from public.finance_expense_categories
  where name = 'Psychologist session payout' and is_active
  limit 1
  returning id into ledger_id;

  if ledger_id is null then
    raise exception 'Psychologist session payout expense category is unavailable.';
  end if;

  update public.psychologist_session_payables
  set status = 'paid',
      paid_at = coalesce(paid_on, public.business_today())::timestamptz,
      paid_by = (select auth.uid()),
      payment_reference = nullif(btrim(reference), ''),
      finance_transaction_id = ledger_id
  where id = payable.id
  returning * into payable;

  insert into public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    (select auth.uid()),
    'psychologist_session_payable_paid',
    'psychologist_session_payables',
    payable.id,
    jsonb_build_object('status', 'payment_due'),
    jsonb_build_object(
      'status', 'paid',
      'finance_transaction_id', ledger_id,
      'amount', payable.payable_amount
    )
  );

  return payable;
end;
$$;

revoke all on function public.settle_psychologist_session_payable(uuid, uuid, date, text, text) from public, anon;
grant execute on function public.settle_psychologist_session_payable(uuid, uuid, date, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
