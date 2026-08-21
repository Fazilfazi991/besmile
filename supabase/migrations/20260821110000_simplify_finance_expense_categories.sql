-- Finance expense categories are a reporting classification.  Transaction
-- origins (expense, payroll_payment, psychologist_payment) remain unchanged.
insert into public.finance_expense_categories(name, is_active) values
  ('Capital Expense', true),
  ('Monthly Expense', true),
  ('Maintenance', true)
on conflict(name) do update set is_active = true;

-- Deterministic mappings for known historical category names.  Unknown legacy
-- names, including the ambiguous "Other", are deliberately preserved as-is.
update public.finance_transactions transaction
set expense_category_id = category.id
from public.finance_expense_categories category, public.finance_expense_categories legacy
where category.name = 'Monthly Expense'
  and legacy.id = transaction.expense_category_id
  and lower(trim(legacy.name)) in ('salary', 'rent', 'utilities', 'marketing', 'advertising', 'meta ads', 'google ads', 'website', 'hosting', 'software', 'saas', 'internet', 'office', 'office supplies', 'travel', 'psychologist session payout');

update public.finance_transactions transaction
set expense_category_id = category.id
from public.finance_expense_categories category, public.finance_expense_categories legacy
where category.name = 'Capital Expense'
  and legacy.id = transaction.expense_category_id
  and lower(trim(legacy.name)) in ('capital', 'capital expense', 'equipment', 'equipment purchase', 'furniture', 'office setup', 'laptop', 'computer', 'asset', 'assets');

update public.finance_transactions transaction
set expense_category_id = category.id
from public.finance_expense_categories category, public.finance_expense_categories legacy
where category.name = 'Maintenance'
  and legacy.id = transaction.expense_category_id
  and lower(trim(legacy.name)) in ('maintenance', 'repair', 'repairs', 'website maintenance', 'laptop servicing', 'equipment repair', 'technical maintenance');

-- Payroll and outsourced-clinician settlements are operating expenditure even
-- though their transaction origins are retained for audit and reconciliation.
update public.finance_transactions transaction
set expense_category_id = category.id
from public.finance_expense_categories category
where category.name = 'Monthly Expense'
  and transaction.transaction_type in ('payroll_payment', 'psychologist_payment');

-- Legacy category rows remain for historical joins but cannot be selected for
-- new or edited expenses.  Only the three canonical categories stay active.
update public.finance_expense_categories
set is_active = false
where name not in ('Capital Expense', 'Monthly Expense', 'Maintenance');

alter table public.finance_transactions drop constraint if exists finance_transactions_category_check;
alter table public.finance_transactions add constraint finance_transactions_category_check check(
  (transaction_type = 'income' and income_category_id is not null and expense_category_id is null)
  or (transaction_type in ('expense', 'payroll_payment', 'psychologist_payment') and expense_category_id is not null and income_category_id is null)
  or transaction_type in ('adjustment', 'invoice_payment')
);

-- Enforce the simplified category model for direct requests as well as the UI.
create or replace function public.validate_finance_transaction_master_data()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (select 1 from public.finance_accounts where id = new.account_id and is_active) then
    raise exception 'Select an active finance account.';
  end if;
  if new.transaction_type = 'income' and not exists (select 1 from public.finance_income_categories where id = new.income_category_id and is_active) then
    raise exception 'Select an active income category.';
  end if;
  if new.transaction_type in ('expense', 'payroll_payment', 'psychologist_payment') and not exists (
    select 1 from public.finance_expense_categories
    where id = new.expense_category_id
      and is_active
      and name in ('Capital Expense', 'Monthly Expense', 'Maintenance')
  ) then
    raise exception 'Select Capital Expense, Monthly Expense, or Maintenance.';
  end if;
  if new.payment_method not in ('cash', 'bank_transfer', 'upi', 'card') then
    raise exception 'Select a valid payment method.';
  end if;
  return new;
end;
$$;

create or replace function public.pay_payroll_entry_atomic(target_entry uuid, target_account uuid, paid_on date, method text, reference text default null)
returns public.payroll_entries language plpgsql security definer set search_path='' as $$
declare entry public.payroll_entries%rowtype; run public.payroll_runs%rowtype; ledger_id uuid; net_amount numeric;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') or not public.has_permission('finance.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into entry from public.payroll_entries where id=target_entry for update;
  if entry.id is null or entry.payment_status='paid' or entry.finance_transaction_id is not null then raise exception 'This salary has already been paid.'; end if;
  select * into run from public.payroll_runs where id=entry.payroll_run_id for update;
  if run.status <> 'approved' then raise exception 'Payroll must be approved before payment.'; end if;
  net_amount := entry.basic_salary + entry.allowances - entry.deductions;
  if net_amount <= 0 then raise exception 'Payroll net amount must be greater than zero.'; end if;
  insert into public.finance_transactions(transaction_type, account_id, expense_category_id, amount, transaction_date, payment_method, reference_number, description, created_by)
  select 'payroll_payment', target_account, id, net_amount, coalesce(paid_on, (now() at time zone 'Asia/Dubai')::date), method, nullif(btrim(reference), ''), 'Salary payment: ' || entry.profile_id::text, (select auth.uid())
  from public.finance_expense_categories where name='Monthly Expense' and is_active
  returning id into ledger_id;
  if ledger_id is null then raise exception 'Monthly Expense category is unavailable.'; end if;
  update public.payroll_entries set payment_status='paid', payment_date=coalesce(paid_on, (now() at time zone 'Asia/Dubai')::date), payment_method=method, payment_reference=nullif(btrim(reference), ''), finance_transaction_id=ledger_id where id=entry.id returning * into entry;
  if not exists(select 1 from public.payroll_entries where payroll_run_id=run.id and payment_status <> 'paid') then update public.payroll_runs set status='paid', payment_date=coalesce(paid_on, (now() at time zone 'Asia/Dubai')::date), account_id=target_account, payment_method=method where id=run.id; end if;
  return entry;
end $$;
revoke all on function public.pay_payroll_entry_atomic(uuid,uuid,date,text,text) from public, anon;
grant execute on function public.pay_payroll_entry_atomic(uuid,uuid,date,text,text) to authenticated, service_role;

create or replace function public.settle_psychologist_session_payable(target_payable uuid, target_account uuid, paid_on date, method text, reference text default null)
returns public.psychologist_session_payables language plpgsql security definer set search_path='' as $$
declare payable public.psychologist_session_payables%rowtype; ledger_id uuid;
begin
  if (select auth.uid()) is null or not public.has_permission('psychologist_payments.settle') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into payable from public.psychologist_session_payables where id=target_payable for update;
  if payable.id is null or payable.status not in ('payment_due','scheduled') or payable.finance_transaction_id is not null then raise exception 'This payable is not available for settlement.'; end if;
  if not exists(select 1 from public.finance_accounts where id=target_account and is_active) then raise exception 'Payment account is unavailable.'; end if;
  if method not in ('cash','bank_transfer','upi','card') then raise exception 'Payment method is unavailable.'; end if;
  insert into public.finance_transactions(transaction_type,account_id,expense_category_id,amount,transaction_date,payment_method,reference_number,description,created_by) select 'psychologist_payment',target_account,id,payable.payable_amount,coalesce(paid_on,public.business_today()),method,nullif(btrim(reference),''),'Psychologist session payable: '||payable.id::text,(select auth.uid()) from public.finance_expense_categories where name='Monthly Expense' and is_active limit 1 returning id into ledger_id;
  if ledger_id is null then raise exception 'Monthly Expense category is unavailable.'; end if;
  update public.psychologist_session_payables set status='paid',paid_at=coalesce(paid_on,public.business_today())::timestamptz,paid_by=(select auth.uid()),payment_reference=nullif(btrim(reference),''),finance_transaction_id=ledger_id where id=payable.id returning * into payable;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values((select auth.uid()),'psychologist_session_payable_paid','psychologist_session_payables',payable.id,jsonb_build_object('status','payment_due'),jsonb_build_object('status','paid','finance_transaction_id',ledger_id,'amount',payable.payable_amount));
  return payable;
end $$;
revoke all on function public.settle_psychologist_session_payable(uuid,uuid,date,text,text) from public, anon;
grant execute on function public.settle_psychologist_session_payable(uuid,uuid,date,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';
