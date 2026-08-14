-- Batch 2: financially independent payables for eligible completed online
-- outsourced-psychologist appointments. No clinical record content is stored here.

insert into public.permissions(code, description) values
  ('psychologist_payments.view', 'View psychologist session payment liabilities'),
  ('psychologist_payments.manage', 'Manage psychologist session payment liabilities'),
  ('psychologist_payments.settle', 'Settle psychologist session payment liabilities')
on conflict(code) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role join public.permissions permission
  on permission.code in ('psychologist_payments.view','psychologist_payments.manage','psychologist_payments.settle')
where role.code in ('chairman','director','general_manager')
on conflict do nothing;

create table if not exists public.psychologist_payout_settings (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null unique references public.outsourced_doctors(id) on delete restrict,
  default_session_payout numeric(14,2) not null check(default_session_payout > 0),
  payment_cycle_type text not null default 'submission_plus_days' check(payment_cycle_type in ('submission_plus_days','biweekly','monthly','manual')),
  payment_term_days integer not null default 14 check(payment_term_days between 0 and 365),
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.psychologist_session_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.doctor_appointments(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.psychologist_session_payables (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.doctor_appointments(id) on delete restrict,
  psychologist_id uuid not null references public.outsourced_doctors(id) on delete restrict,
  psychologist_profile_id uuid references public.profiles(id) on delete set null,
  session_date date not null,
  session_completed_at timestamptz not null,
  session_record_submitted_at timestamptz not null,
  client_charge numeric(14,2),
  psychologist_rate numeric(14,2) not null check(psychologist_rate > 0),
  payable_amount numeric(14,2) not null check(payable_amount > 0),
  currency text not null default 'INR' check(currency = 'INR'),
  due_date date,
  payment_cycle_type text not null check(payment_cycle_type in ('submission_plus_days','biweekly','monthly','manual')),
  payment_term_days integer,
  status text not null default 'payment_due' check(status in ('payment_due','scheduled','paid','on_hold','cancelled')),
  paid_at timestamptz,
  paid_by uuid references public.profiles(id) on delete set null,
  payment_reference text,
  finance_transaction_id uuid references public.finance_transactions(id) on delete set null,
  hold_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((status = 'paid') = (paid_at is not null)),
  check((status = 'cancelled') = (cancelled_at is not null))
);

create table if not exists public.psychologist_payable_issues (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.doctor_appointments(id) on delete restrict,
  doctor_id uuid not null references public.outsourced_doctors(id) on delete restrict,
  issue_code text not null check(issue_code in ('missing_rate')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists psychologist_session_payables_status_due_idx on public.psychologist_session_payables(status, due_date) where status in ('payment_due','scheduled','on_hold');
create index if not exists psychologist_session_payables_psychologist_idx on public.psychologist_session_payables(psychologist_id, session_date desc);

alter table public.psychologist_payout_settings enable row level security;
alter table public.psychologist_session_records enable row level security;
alter table public.psychologist_session_payables enable row level security;
alter table public.psychologist_payable_issues enable row level security;
grant select on public.psychologist_payout_settings, public.psychologist_session_records, public.psychologist_session_payables, public.psychologist_payable_issues to authenticated;
grant insert, update on public.psychologist_payout_settings to authenticated;

create policy "psychologist payout settings finance access" on public.psychologist_payout_settings for all to authenticated
  using(public.has_permission('psychologist_payments.manage')) with check(public.has_permission('psychologist_payments.manage'));
create policy "psychologist session records submitter access" on public.psychologist_session_records for select to authenticated
  using(public.has_permission('psychologist_payments.view') or submitted_by = (select auth.uid()));
create policy "psychologist session records submit" on public.psychologist_session_records for insert to authenticated
  with check(submitted_by = (select auth.uid()) and exists(select 1 from public.doctor_appointments a join public.outsourced_doctors d on d.id=a.doctor_id where a.id=appointment_id and a.status='completed' and a.consultation_type='online' and d.profile_id=(select auth.uid()) and d.clinician_type='outsourced'));
create policy "psychologist payables finance read" on public.psychologist_session_payables for select to authenticated
  using(public.has_permission('psychologist_payments.view'));
create policy "psychologist payable issues finance read" on public.psychologist_payable_issues for select to authenticated
  using(public.has_permission('psychologist_payments.manage'));

create or replace function public.psychologist_payable_notify_management(target_payable public.psychologist_session_payables)
returns void language plpgsql security definer set search_path='' as $$
declare recipient record;
begin
  for recipient in select id from public.profiles where status='active' and role::text in ('chairman','director','general_manager') loop
    perform public.notify_user(recipient.id, 'Online session payable created', format('A psychologist session payable of INR %s is due on %s.', target_payable.payable_amount, target_payable.due_date), 'psychologist_payable_created', target_payable.id, '/admin/finance/psychologist-payments', null, 'finance', 'high', 'standard', false, jsonb_build_object('payable_id',target_payable.id));
  end loop;
end $$;
revoke all on function public.psychologist_payable_notify_management(public.psychologist_session_payables) from public, anon, authenticated;

create or replace function public.create_psychologist_session_payable(target_appointment uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare appointment public.doctor_appointments%rowtype; clinician public.outsourced_doctors%rowtype; record_row public.psychologist_session_records%rowtype; setting public.psychologist_payout_settings%rowtype; payable public.psychologist_session_payables%rowtype; created_id uuid; completed_at timestamptz;
begin
  select * into appointment from public.doctor_appointments where id=target_appointment and deleted_at is null for update;
  if appointment.id is null or appointment.consultation_type <> 'online' or appointment.status <> 'completed' then return null; end if;
  select * into clinician from public.outsourced_doctors where id=appointment.doctor_id and archived_at is null;
  -- Only externally compensated clinicians are eligible; salaried staff remain payroll-only.
  if clinician.id is null or clinician.clinician_type <> 'outsourced' then return null; end if;
  select * into record_row from public.psychologist_session_records where appointment_id=appointment.id;
  if record_row.id is null then return null; end if;
  select * into setting from public.psychologist_payout_settings where doctor_id=clinician.id and is_active;
  if setting.id is null then
    insert into public.psychologist_payable_issues(appointment_id,doctor_id,issue_code) values(appointment.id,clinician.id,'missing_rate') on conflict(appointment_id) do nothing;
    return null;
  end if;
  completed_at := appointment.updated_at;
  insert into public.psychologist_session_payables(appointment_id,psychologist_id,psychologist_profile_id,session_date,session_completed_at,session_record_submitted_at,psychologist_rate,payable_amount,currency,due_date,payment_cycle_type,payment_term_days)
  values(appointment.id,clinician.id,clinician.profile_id,(appointment.start_at at time zone public.business_timezone())::date,completed_at,record_row.submitted_at,setting.default_session_payout,setting.default_session_payout,'INR',case when setting.payment_cycle_type='submission_plus_days' then (record_row.submitted_at at time zone public.business_timezone())::date+setting.payment_term_days else null end,setting.payment_cycle_type,setting.payment_term_days)
  on conflict(appointment_id) do nothing returning * into payable;
  if payable.id is null then return null; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(null,'psychologist_session_payable_created','psychologist_session_payables',payable.id,jsonb_build_object('appointment_id',appointment.id,'psychologist_id',clinician.id,'amount',payable.payable_amount,'currency','INR','due_date',payable.due_date,'rate_snapshot',payable.psychologist_rate));
  perform public.psychologist_payable_notify_management(payable);
  return payable.id;
end $$;
revoke all on function public.create_psychologist_session_payable(uuid) from public, anon;
grant execute on function public.create_psychologist_session_payable(uuid) to service_role;

create or replace function public.psychologist_session_record_payable_trigger()
returns trigger language plpgsql security definer set search_path='' as $$ begin perform public.create_psychologist_session_payable(new.appointment_id); return new; end $$;
revoke all on function public.psychologist_session_record_payable_trigger() from public, anon, authenticated;
drop trigger if exists psychologist_session_record_creates_payable on public.psychologist_session_records;
create trigger psychologist_session_record_creates_payable after insert on public.psychologist_session_records for each row execute function public.psychologist_session_record_payable_trigger();

create or replace function public.psychologist_appointment_payable_trigger()
returns trigger language plpgsql security definer set search_path='' as $$ begin if new.status='completed' and old.status is distinct from new.status then perform public.create_psychologist_session_payable(new.id); end if; if new.status='cancelled' and old.status is distinct from new.status then update public.psychologist_session_payables set status='cancelled',cancelled_at=now(),cancelled_by=(select auth.uid()),cancellation_reason='Appointment cancelled after payable creation' where appointment_id=new.id and status in ('payment_due','scheduled','on_hold'); end if; return new; end $$;
revoke all on function public.psychologist_appointment_payable_trigger() from public, anon, authenticated;
drop trigger if exists psychologist_appointment_payable_lifecycle on public.doctor_appointments;
create trigger psychologist_appointment_payable_lifecycle after update of status on public.doctor_appointments for each row execute function public.psychologist_appointment_payable_trigger();

alter table public.finance_transactions drop constraint if exists finance_transactions_transaction_type_check;
alter table public.finance_transactions drop constraint if exists finance_transactions_check;
alter table public.finance_transactions add constraint finance_transactions_transaction_type_check check(transaction_type in ('income','expense','adjustment','invoice_payment','payroll_payment','psychologist_payment'));
alter table public.finance_transactions add constraint finance_transactions_category_check check(
  (transaction_type='income' and income_category_id is not null and expense_category_id is null)
  or (transaction_type in ('expense','psychologist_payment') and expense_category_id is not null and income_category_id is null)
  or transaction_type in ('adjustment','invoice_payment','payroll_payment')
);

create or replace function public.settle_psychologist_session_payable(target_payable uuid, target_account uuid, paid_on date, method text, reference text default null)
returns public.psychologist_session_payables language plpgsql security definer set search_path='' as $$
declare payable public.psychologist_session_payables%rowtype; ledger_id uuid;
begin
  if (select auth.uid()) is null or not public.has_permission('psychologist_payments.settle') or not public.has_permission('finance.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  select * into payable from public.psychologist_session_payables where id=target_payable for update;
  if payable.id is null or payable.status not in ('payment_due','scheduled') or payable.finance_transaction_id is not null then raise exception 'This payable is not available for settlement.'; end if;
  if not exists(select 1 from public.finance_accounts where id=target_account and is_active) then raise exception 'Payment account is unavailable.'; end if;
  if method not in ('cash','bank_transfer','upi','card') then raise exception 'Payment method is unavailable.'; end if;
  insert into public.finance_transactions(transaction_type,account_id,expense_category_id,amount,transaction_date,payment_method,reference_number,description,created_by) select 'psychologist_payment',target_account,id,payable.payable_amount,coalesce(paid_on,public.business_today()),method,nullif(btrim(reference),''),'Psychologist session payable: '||payable.id::text,(select auth.uid()) from public.finance_expense_categories where name='Psychologist session payout' and is_active limit 1 returning id into ledger_id;
  if ledger_id is null then raise exception 'Psychologist session payout expense category is unavailable.'; end if;
  update public.psychologist_session_payables set status='paid',paid_at=coalesce(paid_on,public.business_today())::timestamptz,paid_by=(select auth.uid()),payment_reference=nullif(btrim(reference),''),finance_transaction_id=ledger_id where id=payable.id returning * into payable;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values((select auth.uid()),'psychologist_session_payable_paid','psychologist_session_payables',payable.id,jsonb_build_object('status','payment_due'),jsonb_build_object('status','paid','finance_transaction_id',ledger_id,'amount',payable.payable_amount));
  return payable;
end $$;
revoke all on function public.settle_psychologist_session_payable(uuid,uuid,date,text,text) from public, anon;
grant execute on function public.settle_psychologist_session_payable(uuid,uuid,date,text,text) to authenticated, service_role;

insert into public.finance_expense_categories(name) values ('Psychologist session payout') on conflict(name) do nothing;
notify pgrst, 'reload schema';
