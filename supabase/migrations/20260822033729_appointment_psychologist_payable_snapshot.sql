-- The payable is derived only from a completed outsourced appointment.  Keep
-- the agreed payout on that appointment so later clinician-rate changes never
-- alter the financial record for an already-booked session.
alter table public.doctor_appointments
  add column if not exists psychologist_fee_snapshot numeric(14,2);

alter table public.doctor_appointments
  drop constraint if exists doctor_appointments_psychologist_fee_snapshot_check;
alter table public.doctor_appointments
  add constraint doctor_appointments_psychologist_fee_snapshot_check
  check (psychologist_fee_snapshot is null or psychologist_fee_snapshot > 0);

-- Appointment schedulers need the currently configured outsourced payout to
-- display it before booking.  This narrow RPC does not grant payout-settings
-- table access or any general Finance capability.
create or replace function public.appointment_psychologist_payment_rates()
returns table(doctor_id uuid, psychologist_fee numeric, currency text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.appointment_has_permission('create') then
    raise exception 'Permission denied for psychologist payment rates' using errcode = '42501';
  end if;

  return query
  select clinician.id, setting.default_session_payout, 'INR'::text
  from public.outsourced_doctors clinician
  join public.psychologist_payout_settings setting
    on setting.doctor_id = clinician.id
   and setting.is_active
  where clinician.clinician_type = 'outsourced'
    and clinician.status = 'active'
    and clinician.archived_at is null;
end;
$$;
revoke all on function public.appointment_psychologist_payment_rates() from public, anon;
grant execute on function public.appointment_psychologist_payment_rates() to authenticated, service_role;

create or replace function public.create_doctor_appointment(
  target_patient uuid,
  target_doctor uuid,
  appointment_start timestamptz,
  appointment_end timestamptz,
  appointment_consultation_type text,
  appointment_remarks text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  clinician public.outsourced_doctors%rowtype;
  configured_fee numeric(14,2);
begin
  if auth.uid() is null or not public.appointment_patient_access('create', target_patient) then
    raise exception 'Permission denied for appointment creation' using errcode = '42501';
  end if;
  if appointment_consultation_type not in ('in_person','online') then
    raise exception 'Choose a valid consultation type.';
  end if;
  if not public.doctor_slot_is_available(target_doctor, appointment_start, appointment_end, null) then
    raise exception 'This doctor is not available for the selected slot.';
  end if;

  select * into clinician from public.outsourced_doctors
  where id = target_doctor and archived_at is null and status = 'active';
  if clinician.id is null then raise exception 'Psychologist unavailable.'; end if;
  if clinician.clinician_type = 'outsourced' then
    select default_session_payout into configured_fee
    from public.psychologist_payout_settings
    where doctor_id = clinician.id and is_active;
    if configured_fee is null or configured_fee <= 0 then
      raise exception 'Configure a positive psychologist session payout before scheduling this outsourced clinician.';
    end if;
  end if;

  insert into public.doctor_appointments(patient_id, doctor_id, start_at, end_at, consultation_type, remarks, psychologist_fee_snapshot, created_by, updated_by)
  values (target_patient, target_doctor, appointment_start, appointment_end, appointment_consultation_type, nullif(trim(appointment_remarks), ''), configured_fee, auth.uid(), auth.uid())
  returning id into new_id;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, next_status, next_start_at, remarks)
  values (new_id, auth.uid(), 'created', 'scheduled', appointment_start, nullif(trim(appointment_remarks), ''));
  perform public.log_doctor_appointment_patient_activity(new_id, target_patient, 'appointment_scheduled', auth.uid(), jsonb_build_object('doctor_id', target_doctor, 'start_at', appointment_start, 'end_at', appointment_end));
  perform public.notify_user(auth.uid(), 'Appointment created', 'Doctor appointment has been scheduled.', 'doctor_appointment_created', new_id, '/admin/doctor-scheduling?appointment=' || new_id::text, auth.uid(), 'appointments', 'normal', 'none', false, jsonb_build_object('appointment_id', new_id, 'patient_id', target_patient));
  return new_id;
end;
$$;

-- Completion calls this from the status trigger, in the same transaction.  It
-- reads only the appointment snapshot for the amount; settings now provide
-- payment terms only.  The unique appointment key is the idempotency boundary.
create or replace function public.create_psychologist_session_payable(target_appointment uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare appointment public.doctor_appointments%rowtype; clinician public.outsourced_doctors%rowtype; setting public.psychologist_payout_settings%rowtype; payable public.psychologist_session_payables%rowtype;
begin
  select * into appointment from public.doctor_appointments where id=target_appointment and deleted_at is null for update;
  if appointment.id is null or appointment.status <> 'completed' or appointment.end_at > now() then return null; end if;
  select * into clinician from public.outsourced_doctors where id=appointment.doctor_id and archived_at is null;
  if clinician.id is null or clinician.clinician_type <> 'outsourced' then return null; end if;
  if appointment.psychologist_fee_snapshot is null or appointment.psychologist_fee_snapshot <= 0 then
    insert into public.psychologist_payable_issues(appointment_id,doctor_id,issue_code) values(appointment.id,clinician.id,'missing_rate') on conflict(appointment_id) do update set issue_code='missing_rate', resolved_at=null, resolved_by=null;
    return null;
  end if;
  select * into setting from public.psychologist_payout_settings where doctor_id=clinician.id and is_active;
  if setting.id is null then
    insert into public.psychologist_payable_issues(appointment_id,doctor_id,issue_code) values(appointment.id,clinician.id,'missing_rate') on conflict(appointment_id) do update set issue_code='missing_rate', resolved_at=null, resolved_by=null;
    return null;
  end if;
  insert into public.psychologist_session_payables(appointment_id,psychologist_id,psychologist_profile_id,clinician_name_snapshot,session_date,session_completed_at,session_record_submitted_at,session_duration_minutes,psychologist_rate,payable_amount,currency,due_date,payment_cycle_type,payment_term_days)
  values(appointment.id,clinician.id,clinician.profile_id,clinician.doctor_name,(appointment.start_at at time zone public.business_timezone())::date,appointment.updated_at,appointment.updated_at,greatest(1,extract(epoch from (appointment.end_at-appointment.start_at))::integer/60),appointment.psychologist_fee_snapshot,appointment.psychologist_fee_snapshot,'INR',case when setting.payment_cycle_type='submission_plus_days' then (appointment.updated_at at time zone public.business_timezone())::date+setting.payment_term_days else null end,setting.payment_cycle_type,setting.payment_term_days)
  on conflict(appointment_id) do nothing returning * into payable;
  if payable.id is null then return null; end if;
  update public.psychologist_payable_issues set resolved_at=now(),resolved_by=(select auth.uid()) where appointment_id=appointment.id and resolved_at is null;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values((select auth.uid()),'psychologist_session_payable_created','psychologist_session_payables',payable.id,jsonb_build_object('appointment_id',appointment.id,'psychologist_id',clinician.id,'amount',payable.payable_amount,'currency','INR','rate_snapshot',payable.psychologist_rate));
  perform public.psychologist_payable_notify_management(payable);
  return payable.id;
end $$;

-- A setting change is prospective.  It must never backfill historical
-- completed appointments without an explicit, separately approved process.
drop trigger if exists psychologist_payout_settings_reconcile_payables on public.psychologist_payout_settings;

notify pgrst, 'reload schema';
