-- Phase 8E additive recovery of verified active Production function contracts.
-- Source behavior recovered from reachable historical migrations; no data rows are copied.

-- Recovered from supabase/migrations/20260822033729_appointment_psychologist_payable_snapshot.sql
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

-- Recovered from supabase/migrations/20260822052547_clinician_payout_configuration.sql
-- Payout configuration is operational clinician data, not Finance or Payroll access.
-- Rates are snapshotted onto new appointments by the existing appointment RPC; this
-- migration deliberately never reconciles historical appointments or payables.

insert into public.permissions(code, description) values
  ('psychologist_payout_settings.manage', 'View and manage outsourced clinician session payout settings')
on conflict (code) do update set description = excluded.description;

-- Keep top-management access compatible with either supported RBAC schema. Aiswarya
-- receives a direct, active-profile grant below so no psychologist/Finance role is broadened.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select management_role.role_name::public.employee_role, permission.id
    from (values ('Chairman'), ('Director'), ('General Manager')) as management_role(role_name)
    join public.permissions permission on permission.code = 'psychologist_payout_settings.manage'
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'psychologist_payout_settings.manage'
    where role.code in ('chairman', 'director', 'general_manager')
    on conflict do nothing;
  else
    raise exception 'Unsupported role_permissions schema for psychologist payout setting permissions';
  end if;
end $$;

insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile.id, permission.id, 'Approved outsourced clinician payout-rate management'
from public.profiles profile
join public.permissions permission on permission.code = 'psychologist_payout_settings.manage'
where profile.id = '4096a95f-970b-4542-8f18-cf5dd6a66150'::uuid
  and profile.status = 'active'
  and not exists (
    select 1
    from public.user_permission_grants grant_row
    where grant_row.profile_id = profile.id
      and grant_row.permission_id = permission.id
      and grant_row.revoked_at is null
  );

drop policy if exists "psychologist payout settings finance access" on public.psychologist_payout_settings;
drop policy if exists "psychologist payout settings management access" on public.psychologist_payout_settings;
create policy "psychologist payout settings management access"
  on public.psychologist_payout_settings for all to authenticated
  using (public.has_permission('psychologist_payout_settings.manage'))
  with check (public.has_permission('psychologist_payout_settings.manage'));

create or replace function public.managed_psychologist_payout_settings()
returns table(
  doctor_id uuid,
  default_session_payout numeric,
  currency text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not public.has_permission('psychologist_payout_settings.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return query
  select setting.doctor_id, setting.default_session_payout, 'INR'::text,
         setting.is_active, setting.updated_at
  from public.psychologist_payout_settings setting
  join public.outsourced_doctors clinician on clinician.id = setting.doctor_id
  where clinician.archived_at is null
  order by clinician.doctor_name;
end;
$$;
revoke all on function public.managed_psychologist_payout_settings() from public, anon;
grant execute on function public.managed_psychologist_payout_settings() to authenticated;

create or replace function public.set_psychologist_payout_setting(
  target_doctor uuid,
  target_payout numeric
)
returns public.psychologist_payout_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician public.outsourced_doctors%rowtype;
  previous_setting public.psychologist_payout_settings%rowtype;
  saved_setting public.psychologist_payout_settings%rowtype;
  previous_data jsonb;
begin
  if (select auth.uid()) is null
     or not public.has_permission('psychologist_payout_settings.manage') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target_payout is null or target_payout <= 0 then
    raise exception 'Psychologist session payout must be greater than zero.';
  end if;

  select * into clinician
  from public.outsourced_doctors
  where id = target_doctor and archived_at is null
  for update;
  if clinician.id is null or clinician.clinician_type <> 'outsourced' or clinician.status <> 'active' then
    raise exception 'Only active outsourced clinicians can have a psychologist payout setting.';
  end if;

  select * into previous_setting
  from public.psychologist_payout_settings
  where doctor_id = clinician.id
  for update;
  previous_data := case when previous_setting.id is null then null else to_jsonb(previous_setting) end;

  insert into public.psychologist_payout_settings(
    doctor_id, default_session_payout, is_active, updated_by
  ) values (
    clinician.id, target_payout, true, (select auth.uid())
  )
  on conflict (doctor_id) do update
    set default_session_payout = excluded.default_session_payout,
        is_active = true,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into saved_setting;

  if previous_data is distinct from to_jsonb(saved_setting) then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (
      (select auth.uid()),
      'psychologist_payout_setting_updated',
      'psychologist_payout_settings',
      saved_setting.id,
      previous_data,
      jsonb_build_object(
        'doctor_id', clinician.id,
        'previous_session_payout', previous_setting.default_session_payout,
        'new_session_payout', saved_setting.default_session_payout,
        'currency', 'INR'
      )
    );
  end if;
  return saved_setting;
end;
$$;
revoke all on function public.set_psychologist_payout_setting(uuid, numeric) from public, anon;
grant execute on function public.set_psychologist_payout_setting(uuid, numeric) to authenticated;

-- New eligible outsourced clinicians receive an initial INR 800 setting exactly once.
-- It never overwrites an active administrator-configured rate.
create or replace function public.initialize_outsourced_psychologist_payout_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare saved_setting public.psychologist_payout_settings%rowtype;
begin
  if new.clinician_type = 'outsourced'
     and new.status = 'active'
     and new.archived_at is null
     and (
       tg_op = 'INSERT'
       or old.clinician_type is distinct from 'outsourced'
       or old.status is distinct from 'active'
       or old.archived_at is not null
     ) then
    insert into public.psychologist_payout_settings(
      doctor_id, default_session_payout, is_active, updated_by
    ) values (new.id, 800, true, new.updated_by)
    on conflict (doctor_id) do update
      set is_active = true,
          updated_by = excluded.updated_by,
          updated_at = now()
      where public.psychologist_payout_settings.is_active = false
    returning * into saved_setting;

    if saved_setting.id is not null then
      insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
      values (
        new.updated_by,
        'psychologist_payout_setting_initialized',
        'psychologist_payout_settings',
        saved_setting.id,
        jsonb_build_object('doctor_id', new.id, 'new_session_payout', saved_setting.default_session_payout, 'currency', 'INR')
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.initialize_outsourced_psychologist_payout_setting() from public, anon, authenticated;
drop trigger if exists outsourced_psychologist_payout_setting_initialize on public.outsourced_doctors;
create trigger outsourced_psychologist_payout_setting_initialize
after insert or update of clinician_type, status, archived_at on public.outsourced_doctors
for each row execute function public.initialize_outsourced_psychologist_payout_setting();

-- Production-approved initial configuration: only active, non-archived outsourced clinicians.
-- No appointment, payable, or finance table is read or changed in this loop.
do $$
declare
  clinician record;
  previous_data jsonb;
  saved_setting public.psychologist_payout_settings%rowtype;
begin
  for clinician in
    select doctor.id
    from public.outsourced_doctors doctor
    where doctor.clinician_type = 'outsourced'
      and doctor.status = 'active'
      and doctor.archived_at is null
    for update
  loop
    select to_jsonb(setting) into previous_data
    from public.psychologist_payout_settings setting
    where setting.doctor_id = clinician.id
    for update;

    insert into public.psychologist_payout_settings(
      doctor_id, default_session_payout, is_active, updated_by
    ) values (clinician.id, 800, true, null)
    on conflict (doctor_id) do update
      set default_session_payout = excluded.default_session_payout,
          is_active = true,
          updated_by = null,
          updated_at = now()
    returning * into saved_setting;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
    values (
      null,
      'psychologist_payout_setting_configured',
      'psychologist_payout_settings',
      saved_setting.id,
      previous_data,
      jsonb_build_object('doctor_id', clinician.id, 'previous_session_payout', coalesce(previous_data ->> 'default_session_payout', null), 'new_session_payout', saved_setting.default_session_payout, 'currency', 'INR', 'source', 'approved_active_outsourced_configuration')
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
