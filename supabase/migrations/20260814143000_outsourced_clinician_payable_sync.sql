-- Canonical outsourced clinician -> completed appointment -> payable lifecycle.
-- `outsourced_doctors` remains the shared clinician identity. No name matching.
alter table public.psychologist_session_payables add column if not exists clinician_name_snapshot text, add column if not exists session_duration_minutes integer;
alter table public.psychologist_session_payables drop constraint if exists psychologist_session_payables_session_duration_minutes_check;
alter table public.psychologist_session_payables add constraint psychologist_session_payables_session_duration_minutes_check check (session_duration_minutes is null or session_duration_minutes between 1 and 1440);
alter table public.psychologist_payable_issues drop constraint if exists psychologist_payable_issues_issue_code_check;
alter table public.psychologist_payable_issues add constraint psychologist_payable_issues_issue_code_check check(issue_code in ('missing_rate', 'requires_financial_reversal'));

create or replace function public.create_psychologist_session_payable(target_appointment uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare appointment public.doctor_appointments%rowtype; clinician public.outsourced_doctors%rowtype; setting public.psychologist_payout_settings%rowtype; payable public.psychologist_session_payables%rowtype;
begin
  select * into appointment from public.doctor_appointments where id=target_appointment and deleted_at is null for update;
  if appointment.id is null or appointment.status <> 'completed' or appointment.end_at > now() then return null; end if;
  select * into clinician from public.outsourced_doctors where id=appointment.doctor_id and archived_at is null;
  if clinician.id is null or clinician.clinician_type <> 'outsourced' then return null; end if;
  select * into setting from public.psychologist_payout_settings where doctor_id=clinician.id and is_active;
  if setting.id is null then
    insert into public.psychologist_payable_issues(appointment_id,doctor_id,issue_code) values(appointment.id,clinician.id,'missing_rate') on conflict(appointment_id) do update set issue_code='missing_rate', resolved_at=null, resolved_by=null;
    return null;
  end if;
  insert into public.psychologist_session_payables(appointment_id,psychologist_id,psychologist_profile_id,clinician_name_snapshot,session_date,session_completed_at,session_record_submitted_at,session_duration_minutes,psychologist_rate,payable_amount,currency,due_date,payment_cycle_type,payment_term_days)
  values(appointment.id,clinician.id,clinician.profile_id,clinician.doctor_name,(appointment.start_at at time zone public.business_timezone())::date,appointment.updated_at,appointment.updated_at,greatest(1,extract(epoch from (appointment.end_at-appointment.start_at))::integer/60),setting.default_session_payout,setting.default_session_payout,'INR',case when setting.payment_cycle_type='submission_plus_days' then (appointment.updated_at at time zone public.business_timezone())::date+setting.payment_term_days else null end,setting.payment_cycle_type,setting.payment_term_days)
  on conflict(appointment_id) do nothing returning * into payable;
  if payable.id is null then return null; end if;
  update public.psychologist_payable_issues set resolved_at=now(),resolved_by=(select auth.uid()) where appointment_id=appointment.id and resolved_at is null;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values((select auth.uid()),'psychologist_session_payable_created','psychologist_session_payables',payable.id,jsonb_build_object('appointment_id',appointment.id,'psychologist_id',clinician.id,'amount',payable.payable_amount,'currency','INR','rate_snapshot',payable.psychologist_rate));
  perform public.psychologist_payable_notify_management(payable);
  return payable.id;
end $$;
revoke all on function public.create_psychologist_session_payable(uuid) from public, anon, authenticated;
grant execute on function public.create_psychologist_session_payable(uuid) to service_role;

create or replace function public.psychologist_appointment_payable_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare payable public.psychologist_session_payables%rowtype;
begin
  if new.status='completed' then perform public.create_psychologist_session_payable(new.id); end if;
  if old.status='completed' and (new.status <> 'completed' or new.deleted_at is not null) then
    select * into payable from public.psychologist_session_payables where appointment_id=new.id for update;
    if payable.id is not null and (payable.status='paid' or payable.finance_transaction_id is not null) then
      raise exception 'A paid psychologist payable requires an authorized financial reversal before this completed appointment can be changed.' using errcode='P0001';
    end if;
    update public.psychologist_session_payables set status='cancelled',cancelled_at=now(),cancelled_by=(select auth.uid()),cancellation_reason='Appointment corrected from completed status' where appointment_id=new.id and status in ('payment_due','scheduled','on_hold');
  end if;
  return new;
end $$;
revoke all on function public.psychologist_appointment_payable_trigger() from public, anon, authenticated;
drop trigger if exists psychologist_appointment_payable_lifecycle on public.doctor_appointments;
create trigger psychologist_appointment_payable_lifecycle after update of status, deleted_at on public.doctor_appointments for each row execute function public.psychologist_appointment_payable_trigger();

create or replace function public.reconcile_clinician_psychologist_payables()
returns trigger language plpgsql security definer set search_path='' as $$
declare appointment record;
begin
  if new.is_active and new.default_session_payout > 0 then
    for appointment in select id from public.doctor_appointments where doctor_id=new.doctor_id and status='completed' and deleted_at is null and end_at <= now() loop perform public.create_psychologist_session_payable(appointment.id); end loop;
  end if;
  return new;
end $$;
revoke all on function public.reconcile_clinician_psychologist_payables() from public, anon, authenticated;
drop trigger if exists psychologist_payout_settings_reconcile_payables on public.psychologist_payout_settings;
create trigger psychologist_payout_settings_reconcile_payables after insert or update of default_session_payout, is_active on public.psychologist_payout_settings for each row execute function public.reconcile_clinician_psychologist_payables();

-- Finance users need a selector without gaining scheduling-table RLS access.
create or replace function public.eligible_psychologist_payment_clinicians()
returns table(id uuid, doctor_name text, consultation_duration_minutes integer, default_session_payout numeric, payment_configured boolean)
language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.has_permission('psychologist_payments.view') then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  return query
  select clinician.id, clinician.doctor_name, clinician.consultation_duration_minutes,
    setting.default_session_payout, coalesce(setting.is_active, false)
  from public.outsourced_doctors clinician
  left join public.psychologist_payout_settings setting on setting.doctor_id=clinician.id
  where clinician.clinician_type='outsourced' and clinician.status='active' and clinician.archived_at is null
  order by clinician.doctor_name;
end $$;
revoke all on function public.eligible_psychologist_payment_clinicians() from public, anon;
grant execute on function public.eligible_psychologist_payment_clinicians() to authenticated, service_role;
notify pgrst, 'reload schema';
