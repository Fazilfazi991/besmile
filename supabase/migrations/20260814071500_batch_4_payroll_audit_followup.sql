-- Batch 4 audit follow-up: preserve the existing payroll model while closing
-- eligibility and settlement validation gaps found during the completion audit.

create or replace function public.create_payroll_run_atomic(target_period_start date,target_period_end date)
returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare created_run public.payroll_runs%rowtype;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_period_start is null or target_period_end is null
     or target_period_start<>date_trunc('month',target_period_start)::date
     or target_period_end<>(date_trunc('month',target_period_start)::date+interval '1 month - 1 day')::date then
    raise exception 'Payroll period must be one complete calendar month.';
  end if;
  insert into public.payroll_runs(period_start,period_end,status,created_by)
  values(target_period_start,target_period_end,'draft',(select auth.uid())) returning * into created_run;
  insert into public.payroll_entries(payroll_run_id,profile_id,basic_salary,base_allowances,base_deductions,allowances,deductions,payment_status)
  select created_run.id,settings.profile_id,settings.basic_salary,settings.default_allowances,settings.default_deductions,settings.default_allowances,settings.default_deductions,'draft'
  from public.employee_salary_settings settings join public.profiles profile on profile.id=settings.profile_id
  where settings.is_active
    and settings.effective_date<=target_period_end
    and profile.is_employee
    and profile.workforce_visible
    and profile.status='active'
    and (profile.joining_date is null or profile.joining_date<=target_period_end);
  if not found then raise exception 'No active employee salary settings are available.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values((select auth.uid()),'payroll_run_created','payroll_runs',created_run.id,jsonb_build_object('period_start',target_period_start,'period_end',target_period_end));
  return created_run;
exception when unique_violation then raise exception 'A payroll run already exists for this period.' using errcode='23505';
end $$;

create or replace function public.pay_payroll_entry_atomic(target_entry uuid,target_account uuid,paid_on date,method text,reference text default null)
returns public.payroll_entries language plpgsql security definer set search_path='' as $$
declare entry public.payroll_entries%rowtype; run public.payroll_runs%rowtype; ledger_id uuid; salary_category uuid;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') or not public.has_permission('finance.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_account is null or nullif(btrim(coalesce(method,'')),'') is null then raise exception 'Payment account and method are required.'; end if;
  if not exists(select 1 from public.finance_accounts where id=target_account and is_active) then raise exception 'Select an active finance account.'; end if;
  select * into entry from public.payroll_entries where id=target_entry for update;
  if entry.id is null then raise exception 'Payroll entry not found.'; end if;
  if entry.payment_status='paid' or entry.finance_transaction_id is not null then raise exception 'This salary has already been paid.'; end if;
  select * into run from public.payroll_runs where id=entry.payroll_run_id for update;
  if run.status<>'approved' or entry.payment_status<>'approved' then raise exception 'Payroll must be approved before payment.'; end if;
  if entry.net_payable<=0 then raise exception 'Payroll net amount must be greater than zero.'; end if;
  select id into salary_category from public.finance_expense_categories where lower(name)='salary' and is_active limit 1;
  insert into public.finance_transactions(transaction_type,account_id,expense_category_id,amount,transaction_date,payment_method,reference_number,description,created_by)
  values('payroll_payment',target_account,salary_category,entry.net_payable,coalesce(paid_on,(now() at time zone 'Asia/Dubai')::date),btrim(method),nullif(btrim(reference),''),'Employee payroll salary payment',(select auth.uid())) returning id into ledger_id;
  perform set_config('app.payroll_transition','pay',true);
  update public.payroll_entries set payment_status='paid',payment_date=coalesce(paid_on,(now() at time zone 'Asia/Dubai')::date),paid_at=now(),payment_method=btrim(method),payment_reference=nullif(btrim(reference),''),finance_transaction_id=ledger_id where id=entry.id returning * into entry;
  if not exists(select 1 from public.payroll_entries where payroll_run_id=run.id and payment_status<>'paid') then
    update public.payroll_runs set status='paid',payment_date=coalesce(paid_on,(now() at time zone 'Asia/Dubai')::date),account_id=target_account,payment_method=btrim(method) where id=run.id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values((select auth.uid()),'employee_payroll_paid','payroll_entries',entry.id,jsonb_build_object('finance_transaction_id',ledger_id,'amount',entry.net_payable,'payment_date',entry.payment_date));
  return entry;
end $$;

revoke all on function public.create_payroll_run_atomic(date,date),public.pay_payroll_entry_atomic(uuid,uuid,date,text,text) from public,anon;
grant execute on function public.create_payroll_run_atomic(date,date),public.pay_payroll_entry_atomic(uuid,uuid,date,text,text) to authenticated,service_role;

notify pgrst,'reload schema';
