-- Phase 8E additive recovery of verified active Production contracts.
-- Source behavior recovered from reachable historical migrations; no data rows are copied.

-- Recovered from supabase/migrations/20260814061003_batch_4_payroll_enhancement.sql
-- Batch 4: auditable employee payroll workflow. Psychologist payables remain separate.

alter table public.payroll_entries
  add column if not exists base_allowances numeric(14,2),
  add column if not exists base_deductions numeric(14,2),
  add column if not exists bonus numeric(14,2) not null default 0,
  add column if not exists incentives numeric(14,2) not null default 0,
  add column if not exists other_earnings numeric(14,2) not null default 0,
  add column if not exists other_deductions numeric(14,2) not null default 0,
  add column if not exists gross_earnings numeric(14,2),
  add column if not exists net_payable numeric(14,2),
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references public.profiles(id),
  add column if not exists paid_at timestamptz;

update public.payroll_entries
set base_allowances=coalesce(base_allowances,allowances,0),
    base_deductions=coalesce(base_deductions,deductions,0),
    gross_earnings=coalesce(basic_salary,0)+coalesce(allowances,0)+coalesce(bonus,0)+coalesce(incentives,0)+coalesce(other_earnings,0),
    net_payable=coalesce(basic_salary,0)+coalesce(allowances,0)+coalesce(bonus,0)+coalesce(incentives,0)+coalesce(other_earnings,0)-coalesce(deductions,0)-coalesce(other_deductions,0),
    finalized_at=case when payment_status in ('approved','paid') then coalesce(finalized_at,updated_at,created_at) else finalized_at end,
    paid_at=case when payment_status='paid' then coalesce(paid_at,payment_date::timestamptz,updated_at) else paid_at end;

alter table public.payroll_entries
  alter column base_allowances set default 0,
  alter column base_allowances set not null,
  alter column base_deductions set default 0,
  alter column base_deductions set not null,
  alter column gross_earnings set not null,
  alter column net_payable set not null;

alter table public.payroll_entries drop constraint if exists payroll_entries_financial_values_valid;
alter table public.payroll_entries add constraint payroll_entries_financial_values_valid check (
  basic_salary>=0 and base_allowances>=0 and base_deductions>=0 and allowances>=0 and deductions>=0
  and bonus>=0 and incentives>=0 and other_earnings>=0 and other_deductions>=0
  and gross_earnings>=0 and net_payable>=0
);

alter table public.employee_salary_settings drop constraint if exists employee_salary_settings_net_valid;
alter table public.employee_salary_settings add constraint employee_salary_settings_net_valid
  check (basic_salary+default_allowances-default_deductions>=0);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_entry_id uuid not null references public.payroll_entries(id) on delete restrict,
  adjustment_type text not null check(adjustment_type in ('allowance','bonus','incentive','other_earning','deduction','other_deduction')),
  amount numeric(14,2) not null check(amount>0),
  reason text not null check(length(btrim(reason)) between 3 and 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  void_reason text,
  check ((voided_at is null and voided_by is null and void_reason is null) or (voided_at is not null and voided_by is not null and length(btrim(void_reason)) between 3 and 500))
);
create index if not exists payroll_adjustments_entry_active_idx on public.payroll_adjustments(payroll_entry_id) where voided_at is null;

create or replace function public.payroll_entry_calculate() returns trigger
language plpgsql set search_path='' as $$
begin
  new.base_allowances:=coalesce(new.base_allowances,new.allowances,0);
  new.base_deductions:=coalesce(new.base_deductions,new.deductions,0);
  new.gross_earnings:=coalesce(new.basic_salary,0)+coalesce(new.allowances,0)+coalesce(new.bonus,0)+coalesce(new.incentives,0)+coalesce(new.other_earnings,0);
  new.net_payable:=new.gross_earnings-coalesce(new.deductions,0)-coalesce(new.other_deductions,0);
  if new.gross_earnings<0 or new.net_payable<0 then raise exception 'Payroll gross and net amounts cannot be negative.'; end if;
  return new;
end $$;

create or replace function public.payroll_entry_guard() returns trigger
language plpgsql set search_path='' as $$
declare transition text:=current_setting('app.payroll_transition',true);
begin
  if tg_op='DELETE' then
    if old.payment_status<>'draft' then raise exception 'Finalized payroll cannot be deleted.'; end if;
    return old;
  end if;
  if old.payment_status='paid' and new is distinct from old then raise exception 'Paid payroll is immutable.'; end if;
  if old.payment_status<>'draft' and row(new.basic_salary,new.allowances,new.deductions,new.base_allowances,new.base_deductions,new.bonus,new.incentives,new.other_earnings,new.other_deductions)
     is distinct from row(old.basic_salary,old.allowances,old.deductions,old.base_allowances,old.base_deductions,old.bonus,old.incentives,old.other_earnings,old.other_deductions) then
    raise exception 'Finalized payroll amounts are immutable.';
  end if;
  if new.payment_status is distinct from old.payment_status then
    if not ((old.payment_status='draft' and new.payment_status='approved' and transition='approve') or (old.payment_status='approved' and new.payment_status='paid' and transition='pay')) then
      raise exception 'Use the controlled payroll workflow to change status.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.payroll_run_guard() returns trigger
language plpgsql set search_path='' as $$
declare transition text:=current_setting('app.payroll_transition',true);
begin
  if tg_op='DELETE' and old.status<>'draft' then raise exception 'Finalized payroll runs cannot be deleted.'; end if;
  if tg_op='DELETE' then return old; end if;
  if old.status='paid' and new is distinct from old then raise exception 'Paid payroll runs are immutable.'; end if;
  if new.status is distinct from old.status and not (
    (old.status='draft' and new.status='approved' and transition='approve') or
    (old.status='approved' and new.status='paid' and transition='pay')
  ) then raise exception 'Use the controlled payroll workflow to change run status.'; end if;
  return new;
end $$;

drop trigger if exists payroll_entry_guard on public.payroll_entries;
create trigger payroll_entry_guard before update or delete on public.payroll_entries for each row execute function public.payroll_entry_guard();
drop trigger if exists payroll_entry_calculate on public.payroll_entries;
create trigger payroll_entry_calculate before insert or update on public.payroll_entries for each row execute function public.payroll_entry_calculate();
drop trigger if exists payroll_run_guard on public.payroll_runs;
create trigger payroll_run_guard before update or delete on public.payroll_runs for each row execute function public.payroll_run_guard();

create or replace function public.create_payroll_run_atomic(target_period_start date,target_period_end date)
returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare created_run public.payroll_runs%rowtype;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_period_start is null or target_period_start<>date_trunc('month',target_period_start)::date
     or target_period_end<>(date_trunc('month',target_period_start)::date+interval '1 month - 1 day')::date then
    raise exception 'Payroll period must be one complete calendar month.';
  end if;
  insert into public.payroll_runs(period_start,period_end,status,created_by)
  values(target_period_start,target_period_end,'draft',(select auth.uid())) returning * into created_run;
  insert into public.payroll_entries(payroll_run_id,profile_id,basic_salary,base_allowances,base_deductions,allowances,deductions,payment_status)
  select created_run.id,settings.profile_id,settings.basic_salary,settings.default_allowances,settings.default_deductions,settings.default_allowances,settings.default_deductions,'draft'
  from public.employee_salary_settings settings join public.profiles profile on profile.id=settings.profile_id
  where settings.is_active and settings.effective_date<=target_period_end and profile.is_employee and profile.status='active';
  if not found then raise exception 'No active employee salary settings are available.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values((select auth.uid()),'payroll_run_created','payroll_runs',created_run.id,jsonb_build_object('period_start',target_period_start,'period_end',target_period_end));
  return created_run;
exception when unique_violation then raise exception 'A payroll run already exists for this period.' using errcode='23505';
end $$;

create or replace function public.add_payroll_adjustment(target_entry uuid,kind text,adjustment_amount numeric,adjustment_reason text)
returns public.payroll_entries language plpgsql security definer set search_path='' as $$
declare entry public.payroll_entries%rowtype; adjustment_id uuid;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into entry from public.payroll_entries where id=target_entry for update;
  if entry.id is null then raise exception 'Payroll entry not found.'; end if;
  if entry.payment_status<>'draft' then raise exception 'Adjustments are allowed only while payroll is draft.'; end if;
  if kind not in ('allowance','bonus','incentive','other_earning','deduction','other_deduction') or adjustment_amount is null or adjustment_amount<=0 or length(btrim(coalesce(adjustment_reason,'')))<3 then raise exception 'Adjustment type, positive amount, and reason are required.'; end if;
  insert into public.payroll_adjustments(payroll_entry_id,adjustment_type,amount,reason,created_by)
  values(entry.id,kind,round(adjustment_amount,2),btrim(adjustment_reason),(select auth.uid())) returning id into adjustment_id;
  update public.payroll_entries set
    allowances=base_allowances+coalesce((select sum(amount) from public.payroll_adjustments where payroll_entry_id=entry.id and voided_at is null and adjustment_type='allowance'),0),
    bonus=coalesce((select sum(amount) from public.payroll_adjustments where payroll_entry_id=entry.id and voided_at is null and adjustment_type='bonus'),0),
    incentives=coalesce((select sum(amount) from public.payroll_adjustments where payroll_entry_id=entry.id and voided_at is null and adjustment_type='incentive'),0),
    other_earnings=coalesce((select sum(amount) from public.payroll_adjustments where payroll_entry_id=entry.id and voided_at is null and adjustment_type='other_earning'),0),
    deductions=base_deductions+coalesce((select sum(amount) from public.payroll_adjustments where payroll_entry_id=entry.id and voided_at is null and adjustment_type='deduction'),0),
    other_deductions=coalesce((select sum(amount) from public.payroll_adjustments where payroll_entry_id=entry.id and voided_at is null and adjustment_type='other_deduction'),0)
  where id=entry.id returning * into entry;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values((select auth.uid()),'payroll_adjustment_added','payroll_entries',entry.id,jsonb_build_object('adjustment_id',adjustment_id,'type',kind,'amount',round(adjustment_amount,2),'reason',btrim(adjustment_reason)));
  return entry;
end $$;

create or replace function public.approve_payroll_run_atomic(target_run uuid)
returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare run public.payroll_runs%rowtype;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into run from public.payroll_runs where id=target_run for update;
  if run.id is null then raise exception 'Payroll run not found.'; end if;
  if run.status<>'draft' then raise exception 'Only draft payroll can be approved.'; end if;
  if not exists(select 1 from public.payroll_entries where payroll_run_id=run.id) then raise exception 'Payroll run has no employees.'; end if;
  if exists(select 1 from public.payroll_entries where payroll_run_id=run.id and (gross_earnings<0 or net_payable<=0)) then raise exception 'Every employee must have a positive valid net payable.'; end if;
  perform set_config('app.payroll_transition','approve',true);
  update public.payroll_entries set payment_status='approved',finalized_at=now(),finalized_by=(select auth.uid()) where payroll_run_id=run.id and payment_status='draft';
  update public.payroll_runs set status='approved',approved_by=(select auth.uid()) where id=run.id returning * into run;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values((select auth.uid()),'payroll_run_approved','payroll_runs',run.id,jsonb_build_object('period_start',run.period_start,'period_end',run.period_end));
  return run;
end $$;

create or replace function public.pay_payroll_entry_atomic(target_entry uuid,target_account uuid,paid_on date,method text,reference text default null)
returns public.payroll_entries language plpgsql security definer set search_path='' as $$
declare entry public.payroll_entries%rowtype; run public.payroll_runs%rowtype; ledger_id uuid; salary_category uuid;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') or not public.has_permission('finance.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_account is null or nullif(btrim(coalesce(method,'')),'') is null then raise exception 'Payment account and method are required.'; end if;
  select * into entry from public.payroll_entries where id=target_entry for update;
  if entry.id is null then raise exception 'Payroll entry not found.'; end if;
  if entry.payment_status='paid' or entry.finance_transaction_id is not null then raise exception 'This salary has already been paid.'; end if;
  select * into run from public.payroll_runs where id=entry.payroll_run_id for update;
  if run.status<>'approved' or entry.payment_status<>'approved' then raise exception 'Payroll must be approved before payment.'; end if;
  if entry.net_payable<=0 then raise exception 'Payroll net amount must be greater than zero.'; end if;
  select id into salary_category from public.finance_expense_categories where lower(name)='salary' limit 1;
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

create or replace function public.record_payroll_payslip_access(target_entry uuid)
returns void language plpgsql security definer set search_path='' as $$
declare entry public.payroll_entries%rowtype;
begin
  select * into entry from public.payroll_entries where id=target_entry;
  if entry.id is null or ((select auth.uid())<>entry.profile_id and not (public.has_permission('payroll.view') or public.has_permission('payroll.manage'))) then raise exception 'Permission denied' using errcode='42501'; end if;
  if entry.payment_status not in ('approved','paid') then raise exception 'Payslip is available only for finalized payroll.'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values((select auth.uid()),'payroll_payslip_downloaded','payroll_entries',entry.id,jsonb_build_object('payroll_run_id',entry.payroll_run_id));
end $$;

alter table public.payroll_adjustments enable row level security;
create schema if not exists private;
create or replace function private.can_view_own_payroll_run(target_run uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.payroll_entries entry
    where entry.payroll_run_id=target_run and entry.profile_id=(select auth.uid()) and entry.payment_status in ('approved','paid')
  )
$$;
drop policy if exists "payroll entries access" on public.payroll_entries;
drop policy if exists "payroll runs access" on public.payroll_runs;
create policy "payroll entries management or own finalized" on public.payroll_entries for select to authenticated using(
  public.has_permission('payroll.view') or public.has_permission('payroll.manage') or (profile_id=(select auth.uid()) and payment_status in ('approved','paid'))
);
create policy "payroll entries management write" on public.payroll_entries for all to authenticated using(public.has_permission('payroll.manage')) with check(public.has_permission('payroll.manage'));
create policy "payroll runs management or own entry" on public.payroll_runs for select to authenticated using(
  public.has_permission('payroll.view') or public.has_permission('payroll.manage') or private.can_view_own_payroll_run(id)
);
create policy "payroll runs management write" on public.payroll_runs for all to authenticated using(public.has_permission('payroll.manage')) with check(public.has_permission('payroll.manage'));
create policy "payroll adjustments management or own finalized" on public.payroll_adjustments for select to authenticated using(
  public.has_permission('payroll.view') or public.has_permission('payroll.manage') or exists(select 1 from public.payroll_entries entry where entry.id=payroll_entry_id and entry.profile_id=(select auth.uid()) and entry.payment_status in ('approved','paid'))
);
create policy "payroll adjustments management write" on public.payroll_adjustments for all to authenticated using(public.has_permission('payroll.manage')) with check(public.has_permission('payroll.manage'));

grant select on public.payroll_runs,public.payroll_entries,public.payroll_adjustments to authenticated;
revoke insert,update,delete on public.payroll_runs,public.payroll_entries,public.payroll_adjustments from authenticated;
grant usage on schema private to authenticated;
revoke execute on function private.can_view_own_payroll_run(uuid) from public,anon;
grant execute on function private.can_view_own_payroll_run(uuid) to authenticated,service_role;
revoke execute on function public.create_payroll_run_atomic(date,date),public.add_payroll_adjustment(uuid,text,numeric,text),public.approve_payroll_run_atomic(uuid),public.pay_payroll_entry_atomic(uuid,uuid,date,text,text),public.record_payroll_payslip_access(uuid) from public,anon;
grant execute on function public.create_payroll_run_atomic(date,date),public.add_payroll_adjustment(uuid,text,numeric,text),public.approve_payroll_run_atomic(uuid),public.pay_payroll_entry_atomic(uuid,uuid,date,text,text),public.record_payroll_payslip_access(uuid) to authenticated,service_role;

notify pgrst,'reload schema';

-- Recovered from supabase/migrations/20260814071500_batch_4_payroll_audit_followup.sql
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

revoke execute on function public.payroll_entry_calculate(),public.payroll_entry_guard(),public.payroll_run_guard() from public,anon,authenticated;

notify pgrst,'reload schema';
