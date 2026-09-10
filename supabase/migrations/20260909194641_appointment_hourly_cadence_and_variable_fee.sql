-- Appointment fees are chosen per booking and stored in the existing immutable
-- financial snapshot field. Existing rows are intentionally not rewritten.
-- Patient creation/edit already has permission-scoped RLS policies, but QA
-- exposed missing Data API grants that prevented those policies from running.
grant insert, update on public.patients to authenticated;

alter table public.doctor_appointments
  drop constraint if exists doctor_appointments_psychologist_fee_snapshot_check;
alter table public.doctor_appointments
  add constraint doctor_appointments_psychologist_fee_snapshot_check
  check (psychologist_fee_snapshot is null or psychologist_fee_snapshot >= 0);

drop function if exists public.create_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, text);
create function public.create_doctor_appointment(
  target_patient uuid,
  target_doctor uuid,
  appointment_start timestamptz,
  appointment_end timestamptz,
  appointment_consultation_type text,
  appointment_fee numeric,
  appointment_remarks text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  clinician public.outsourced_doctors%rowtype;
begin
  if auth.uid() is null or not public.appointment_patient_access('create', target_patient) then
    raise exception 'Permission denied for appointment creation' using errcode = '42501';
  end if;
  if appointment_consultation_type not in ('in_person','online') then
    raise exception 'Choose a valid consultation type.';
  end if;
  if appointment_fee is null or appointment_fee < 0 or appointment_fee > 999999999999.99 then
    raise exception 'Appointment fee must be a valid non-negative amount.' using errcode = '22003';
  end if;
  if scale(appointment_fee) > 2 then
    raise exception 'Appointment fee can have at most two decimal places.' using errcode = '22003';
  end if;
  if not public.doctor_slot_is_available(target_doctor, appointment_start, appointment_end, null) then
    raise exception 'This doctor is not available for the selected slot.';
  end if;

  select * into clinician from public.outsourced_doctors
  where id = target_doctor and archived_at is null and status = 'active';
  if clinician.id is null then raise exception 'Psychologist unavailable.'; end if;

  insert into public.doctor_appointments(patient_id, doctor_id, start_at, end_at, consultation_type, remarks, psychologist_fee_snapshot, created_by, updated_by)
  values (target_patient, target_doctor, appointment_start, appointment_end, appointment_consultation_type, nullif(trim(appointment_remarks), ''), appointment_fee, auth.uid(), auth.uid())
  returning id into new_id;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, next_status, next_start_at, remarks)
  values (new_id, auth.uid(), 'created', 'scheduled', appointment_start, nullif(trim(appointment_remarks), ''));
  perform public.log_doctor_appointment_patient_activity(new_id, target_patient, 'appointment_scheduled', auth.uid(), jsonb_build_object('doctor_id', target_doctor, 'start_at', appointment_start, 'end_at', appointment_end, 'appointment_fee', appointment_fee));
  perform public.notify_user(auth.uid(), 'Appointment created', 'Doctor appointment has been scheduled.', 'doctor_appointment_created', new_id, '/admin/doctor-scheduling?appointment=' || new_id::text, auth.uid(), 'appointments', 'normal', 'none', false, jsonb_build_object('appointment_id', new_id, 'patient_id', target_patient));
  return new_id;
end;
$$;
revoke all on function public.create_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, numeric, text) from public, anon;
grant execute on function public.create_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, numeric, text) to authenticated, service_role;

drop function if exists public.update_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, text, text);
create function public.update_doctor_appointment(
  target_appointment uuid,
  target_doctor uuid,
  appointment_start timestamptz,
  appointment_end timestamptz,
  appointment_consultation_type text,
  next_status text,
  appointment_fee numeric,
  appointment_remarks text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.doctor_appointments%rowtype;
  action_name text := 'appointment_edited';
begin
  select * into current_row from public.doctor_appointments where id = target_appointment and deleted_at is null;
  if current_row.id is null then raise exception 'Appointment unavailable.'; end if;
  if auth.uid() is null or not public.appointment_patient_access('update', current_row.patient_id) then
    raise exception 'Permission denied for appointment update' using errcode = '42501';
  end if;
  if appointment_consultation_type not in ('in_person','online') or next_status not in ('scheduled','confirmed','completed','cancelled','rescheduled','no_show') then
    raise exception 'Choose valid appointment details.';
  end if;
  if appointment_fee is null or appointment_fee < 0 or appointment_fee > 999999999999.99 then
    raise exception 'Appointment fee must be a valid non-negative amount.' using errcode = '22003';
  end if;
  if scale(appointment_fee) > 2 then
    raise exception 'Appointment fee can have at most two decimal places.' using errcode = '22003';
  end if;
  if current_row.status = 'completed' and appointment_fee is distinct from current_row.psychologist_fee_snapshot then
    raise exception 'A completed appointment fee cannot be changed.' using errcode = '22023';
  end if;
  if next_status = 'cancelled' and not public.appointment_patient_access('cancel', current_row.patient_id) then
    raise exception 'Permission denied for cancellation' using errcode = '42501';
  end if;
  if next_status in ('confirmed','completed','no_show') and not public.appointment_patient_access('update_status', current_row.patient_id) then
    raise exception 'Permission denied for status updates' using errcode = '42501';
  end if;
  if target_doctor is distinct from current_row.doctor_id or appointment_start is distinct from current_row.start_at or appointment_end is distinct from current_row.end_at then
    if not public.appointment_patient_access('reschedule', current_row.patient_id) then
      raise exception 'Permission denied for rescheduling' using errcode = '42501';
    end if;
    action_name := 'appointment_rescheduled';
    if not public.doctor_slot_is_available(target_doctor, appointment_start, appointment_end, target_appointment) then
      raise exception 'This doctor is not available for the selected slot.';
    end if;
  end if;

  update public.doctor_appointments
  set doctor_id = target_doctor,
      start_at = appointment_start,
      end_at = appointment_end,
      consultation_type = appointment_consultation_type,
      status = next_status,
      remarks = nullif(trim(appointment_remarks), ''),
      psychologist_fee_snapshot = appointment_fee,
      updated_by = auth.uid()
  where id = target_appointment;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, previous_status, next_status, previous_start_at, next_start_at, remarks)
  values (target_appointment, auth.uid(), action_name, current_row.status, next_status, current_row.start_at, appointment_start, nullif(trim(appointment_remarks), ''));
  perform public.log_doctor_appointment_patient_activity(target_appointment, current_row.patient_id, action_name, auth.uid(), jsonb_build_object('doctor_id', target_doctor, 'previous_doctor_id', current_row.doctor_id, 'previous_start_at', current_row.start_at, 'start_at', appointment_start, 'status', next_status, 'previous_appointment_fee', current_row.psychologist_fee_snapshot, 'appointment_fee', appointment_fee));
  return target_appointment;
end;
$$;
revoke all on function public.update_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, text, numeric, text) from public, anon;
grant execute on function public.update_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, text, numeric, text) to authenticated, service_role;

-- A deliberately free appointment is not a missing-rate error and creates no payable.
create or replace function public.create_psychologist_session_payable(target_appointment uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare appointment public.doctor_appointments%rowtype; clinician public.outsourced_doctors%rowtype; setting public.psychologist_payout_settings%rowtype; payable public.psychologist_session_payables%rowtype;
begin
  select * into appointment from public.doctor_appointments where id=target_appointment and deleted_at is null for update;
  if appointment.id is null or appointment.status <> 'completed' or appointment.end_at > now() then return null; end if;
  select * into clinician from public.outsourced_doctors where id=appointment.doctor_id and archived_at is null;
  if clinician.id is null or clinician.clinician_type <> 'outsourced' then return null; end if;
  if appointment.psychologist_fee_snapshot = 0 then return null; end if;
  if appointment.psychologist_fee_snapshot is null then
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
revoke all on function public.create_psychologist_session_payable(uuid) from public, anon;
grant execute on function public.create_psychologist_session_payable(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
