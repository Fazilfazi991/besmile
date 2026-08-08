-- Payroll runs and salary payments must not leave partial payroll or ledger records.
create or replace function public.create_payroll_run_atomic(target_period_start date, target_period_end date)
returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare created_run public.payroll_runs%rowtype;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if target_period_start is null or target_period_end is null or target_period_end < target_period_start then
    raise exception 'Invalid payroll period.';
  end if;
  insert into public.payroll_runs(period_start, period_end, status, created_by)
  values(target_period_start, target_period_end, 'draft', (select auth.uid()))
  returning * into created_run;
  insert into public.payroll_entries(payroll_run_id, profile_id, basic_salary, allowances, deductions, payment_status)
  select created_run.id, settings.profile_id, settings.basic_salary, settings.default_allowances, settings.default_deductions, 'draft'
  from public.employee_salary_settings settings
  join public.profiles profile on profile.id = settings.profile_id
  where settings.is_active
    and profile.is_employee
    and profile.status = 'active';
  if not found then raise exception 'No active employee salary settings are available.'; end if;
  return created_run;
end $$;

create or replace function public.pay_payroll_entry_atomic(target_entry uuid, target_account uuid, paid_on date, method text, reference text default null)
returns public.payroll_entries language plpgsql security definer set search_path='' as $$
declare entry public.payroll_entries%rowtype; run public.payroll_runs%rowtype; ledger_id uuid; net_amount numeric;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') or not public.has_permission('finance.manage') then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  select * into entry from public.payroll_entries where id=target_entry for update;
  if entry.id is null or entry.payment_status='paid' or entry.finance_transaction_id is not null then
    raise exception 'This salary has already been paid.';
  end if;
  select * into run from public.payroll_runs where id=entry.payroll_run_id for update;
  if run.status <> 'approved' then raise exception 'Payroll must be approved before payment.'; end if;
  net_amount := entry.basic_salary + entry.allowances - entry.deductions;
  if net_amount <= 0 then raise exception 'Payroll net amount must be greater than zero.'; end if;
  insert into public.finance_transactions(transaction_type, account_id, amount, transaction_date, payment_method, reference_number, description, created_by)
  values('payroll_payment', target_account, net_amount, coalesce(paid_on, (now() at time zone 'Asia/Dubai')::date), method, nullif(btrim(reference), ''), 'Salary payment: ' || entry.profile_id::text, (select auth.uid()))
  returning id into ledger_id;
  update public.payroll_entries set payment_status='paid', payment_date=coalesce(paid_on, (now() at time zone 'Asia/Dubai')::date), payment_method=method, payment_reference=nullif(btrim(reference), ''), finance_transaction_id=ledger_id where id=entry.id returning * into entry;
  if not exists(select 1 from public.payroll_entries where payroll_run_id=run.id and payment_status <> 'paid') then
    update public.payroll_runs set status='paid', payment_date=coalesce(paid_on, (now() at time zone 'Asia/Dubai')::date), account_id=target_account, payment_method=method where id=run.id;
  end if;
  return entry;
end $$;

revoke execute on function public.create_payroll_run_atomic(date,date) from public,anon;
revoke execute on function public.pay_payroll_entry_atomic(uuid,uuid,date,text,text) from public,anon;
grant execute on function public.create_payroll_run_atomic(date,date) to authenticated,service_role;
grant execute on function public.pay_payroll_entry_atomic(uuid,uuid,date,text,text) to authenticated,service_role;

notify pgrst, 'reload schema';
