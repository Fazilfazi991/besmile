-- Patient-profile appointment actions and role-scoped access for outsourced doctor scheduling.

insert into public.permissions(code, description) values
  ('appointments.view', 'View doctor appointments from patient profiles'),
  ('appointments.create', 'Create doctor appointments from patient profiles'),
  ('appointments.update', 'Edit doctor appointments from patient profiles'),
  ('appointments.reschedule', 'Reschedule doctor appointments from patient profiles'),
  ('appointments.cancel', 'Cancel doctor appointments from patient profiles'),
  ('appointments.delete', 'Soft delete doctor appointments from patient profiles'),
  ('appointments.update_status', 'Update doctor appointment status from patient profiles')
on conflict(code) do update set description = excluded.description;

alter table public.doctor_appointments add column if not exists deleted_at timestamptz;
alter table public.doctor_appointments add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
create index if not exists doctor_appointments_active_patient_start_idx on public.doctor_appointments(patient_id, start_at desc) where deleted_at is null;

grant select, insert, update on public.doctor_appointments to authenticated;
grant select, insert on public.doctor_appointment_activity to authenticated;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'doctor_appointments_no_overlap'
      and conrelid = 'public.doctor_appointments'::regclass
  ) then
    alter table public.doctor_appointments drop constraint doctor_appointments_no_overlap;
  end if;

  alter table public.doctor_appointments
    add constraint doctor_appointments_no_overlap
    exclude using gist (
      doctor_id with =,
      tstzrange(start_at, end_at, '[)') with &&
    )
    where (deleted_at is null and status in ('scheduled','confirmed','completed','rescheduled','no_show'));
end $$;

create or replace function public.appointment_has_permission(action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case action
    when 'view' then public.has_permission('appointments.view') or public.has_permission('doctor_scheduling.view')
    when 'create' then public.has_permission('appointments.create') or public.has_permission('doctor_scheduling.create_appointments')
    when 'update' then public.has_permission('appointments.update') or public.has_permission('doctor_scheduling.update_appointments')
    when 'reschedule' then public.has_permission('appointments.reschedule') or public.has_permission('doctor_scheduling.update_appointments')
    when 'cancel' then public.has_permission('appointments.cancel') or public.has_permission('doctor_scheduling.cancel_appointments')
    when 'delete' then public.has_permission('appointments.delete')
    when 'update_status' then public.has_permission('appointments.update_status') or public.has_permission('doctor_scheduling.update_appointments')
    else false
  end
$$;

create or replace function public.appointment_patient_access(action text, target_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.appointment_has_permission(action)
    and public.patient_access(target_patient)
$$;

create or replace function public.log_doctor_appointment_patient_activity(
  target_appointment uuid,
  target_patient uuid,
  action_name text,
  actor uuid,
  details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.patient_activity_logs(patient_id, action, entity_type, entity_id, performed_by, metadata)
  values (target_patient, action_name, 'doctor_appointment', target_appointment, actor, coalesce(details, '{}'::jsonb));
end $$;

do $$
declare
  management_permissions text[] := array[
    'doctor_scheduling.view','doctor_scheduling.manage_doctors','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.delete','appointments.update_status'
  ];
  administration_permissions text[] := management_permissions;
  care_team_permissions text[] := array[
    'doctor_scheduling.view','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.update_status'
  ];
  intern_permissions text[] := array[
    'doctor_scheduling.view','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
    'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel'
  ];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission
      on (
        (role.code in ('chairman','director','general_manager') and permission.code = any(management_permissions))
        or (role.code in ('administration','administration_admin','reception','receptionist') and permission.code = any(administration_permissions))
        or (role.code in ('psychologist','social_worker') and permission.code = any(care_team_permissions))
        or (role.code = 'intern' and permission.code = any(intern_permissions))
      )
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select seed.role_name::public.employee_role, permission.id
    from (
      values
        ('Chairman', management_permissions),
        ('Director', management_permissions),
        ('General Manager', management_permissions),
        ('Psychologist', care_team_permissions),
        ('Intern', intern_permissions)
    ) as seed(role_name, codes)
    join public.permissions permission on permission.code = any(seed.codes)
    on conflict do nothing;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'designation_permission_bundles') then
    insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
    select bundle.id, permission.id
    from public.designation_permission_bundles bundle
    join public.permissions permission
      on (
        (bundle.department_name = 'Administration' and permission.code = any(administration_permissions))
        or (bundle.designation ilike '%psychologist%' and permission.code = any(care_team_permissions))
        or (bundle.designation ilike '%social worker%' and permission.code = any(care_team_permissions))
        or (bundle.designation ilike '%intern%' and permission.code = any(intern_permissions))
      )
    where bundle.is_active
    on conflict do nothing;
  end if;
end $$;

drop policy if exists "doctor scheduling doctors view" on public.outsourced_doctors;
create policy "doctor scheduling doctors view" on public.outsourced_doctors for select to authenticated using (
  public.appointment_has_permission('view') or public.appointment_has_permission('create') or public.appointment_has_permission('update') or public.appointment_has_permission('reschedule')
);

drop policy if exists "doctor scheduling availability view" on public.doctor_weekly_availability;
create policy "doctor scheduling availability view" on public.doctor_weekly_availability for select to authenticated using (
  public.appointment_has_permission('view') or public.appointment_has_permission('create') or public.appointment_has_permission('update') or public.appointment_has_permission('reschedule')
);

drop policy if exists "doctor scheduling blocked view" on public.doctor_blocked_periods;
create policy "doctor scheduling blocked view" on public.doctor_blocked_periods for select to authenticated using (
  public.appointment_has_permission('view') or public.appointment_has_permission('create') or public.appointment_has_permission('update') or public.appointment_has_permission('reschedule')
);

drop policy if exists "doctor scheduling appointments view" on public.doctor_appointments;
create policy "doctor scheduling appointments view" on public.doctor_appointments for select to authenticated using (
  deleted_at is null
  and public.appointment_patient_access('view', patient_id)
);

drop policy if exists "doctor scheduling appointments create" on public.doctor_appointments;
create policy "doctor scheduling appointments create" on public.doctor_appointments for insert to authenticated with check (
  public.appointment_patient_access('create', patient_id)
  and created_by = auth.uid()
);

drop policy if exists "doctor scheduling appointments update" on public.doctor_appointments;
create policy "doctor scheduling appointments update" on public.doctor_appointments for update to authenticated using (
  public.appointment_patient_access('update', patient_id)
  or public.appointment_patient_access('reschedule', patient_id)
  or public.appointment_patient_access('cancel', patient_id)
  or public.appointment_patient_access('delete', patient_id)
  or public.appointment_patient_access('update_status', patient_id)
) with check (
  public.appointment_patient_access('update', patient_id)
  or public.appointment_patient_access('reschedule', patient_id)
  or public.appointment_patient_access('cancel', patient_id)
  or public.appointment_patient_access('delete', patient_id)
  or public.appointment_patient_access('update_status', patient_id)
);

drop policy if exists "doctor scheduling activity view" on public.doctor_appointment_activity;
create policy "doctor scheduling activity view" on public.doctor_appointment_activity for select to authenticated using (
  exists (
    select 1
    from public.doctor_appointments appointment
    where appointment.id = appointment_id
      and appointment.deleted_at is null
      and public.appointment_patient_access('view', appointment.patient_id)
  )
);

drop policy if exists "doctor scheduling activity insert" on public.doctor_appointment_activity;
create policy "doctor scheduling activity insert" on public.doctor_appointment_activity for insert to authenticated with check (
  actor_id = auth.uid()
  and (
    public.appointment_has_permission('create')
    or public.appointment_has_permission('update')
    or public.appointment_has_permission('reschedule')
    or public.appointment_has_permission('cancel')
    or public.appointment_has_permission('delete')
    or public.appointment_has_permission('update_status')
  )
);

create or replace function public.doctor_slot_is_available(target_doctor uuid, proposed_start timestamptz, proposed_end timestamptz, ignored_appointment uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  app_timezone text := 'Asia/Dubai';
  local_start timestamp;
  local_end timestamp;
  local_day integer;
begin
  select coalesce(timezone, 'Asia/Dubai') into app_timezone from public.company_attendance_settings limit 1;
  local_start := proposed_start at time zone app_timezone;
  local_end := proposed_end at time zone app_timezone;
  local_day := extract(dow from local_start)::integer;

  return proposed_start > now()
    and proposed_start < proposed_end
    and exists (
      select 1 from public.outsourced_doctors doctor
      where doctor.id = target_doctor
        and doctor.status = 'active'
    )
    and exists (
      select 1 from public.doctor_weekly_availability availability
      where availability.doctor_id = target_doctor
        and availability.day_of_week = local_day
        and local_start::time >= availability.start_time
        and local_end::time <= availability.end_time
    )
    and not exists (
      select 1 from public.doctor_blocked_periods blocked
      where blocked.doctor_id = target_doctor
        and blocked.blocked_date = local_start::date
        and (
          blocked.start_time is null
          or tstzrange(
            (blocked.blocked_date + blocked.start_time) at time zone app_timezone,
            (blocked.blocked_date + blocked.end_time) at time zone app_timezone,
            '[)'
          ) && tstzrange(proposed_start, proposed_end, '[)')
        )
    )
    and not exists (
      select 1 from public.doctor_appointments appointment
      where appointment.doctor_id = target_doctor
        and appointment.deleted_at is null
        and appointment.status in ('scheduled','confirmed','completed','rescheduled','no_show')
        and (ignored_appointment is null or appointment.id <> ignored_appointment)
        and tstzrange(appointment.start_at, appointment.end_at, '[)') && tstzrange(proposed_start, proposed_end, '[)')
    );
end $$;

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

  insert into public.doctor_appointments(patient_id, doctor_id, start_at, end_at, consultation_type, remarks, created_by, updated_by)
  values (target_patient, target_doctor, appointment_start, appointment_end, appointment_consultation_type, nullif(trim(appointment_remarks), ''), auth.uid(), auth.uid())
  returning id into new_id;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, next_status, next_start_at, remarks)
  values (new_id, auth.uid(), 'created', 'scheduled', appointment_start, nullif(trim(appointment_remarks), ''));

  perform public.log_doctor_appointment_patient_activity(new_id, target_patient, 'appointment_scheduled', auth.uid(), jsonb_build_object('doctor_id', target_doctor, 'start_at', appointment_start, 'end_at', appointment_end));
  perform public.notify_user(auth.uid(), 'Appointment created', 'Doctor appointment has been scheduled.', 'doctor_appointment_created', new_id, '/admin/doctor-scheduling?appointment=' || new_id::text, auth.uid(), 'appointments', 'normal', 'none', false, jsonb_build_object('appointment_id', new_id, 'patient_id', target_patient));
  return new_id;
end $$;

create or replace function public.update_doctor_appointment(
  target_appointment uuid,
  target_doctor uuid,
  appointment_start timestamptz,
  appointment_end timestamptz,
  appointment_consultation_type text,
  next_status text,
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
  if current_row.id is null then
    raise exception 'Appointment unavailable.';
  end if;
  if auth.uid() is null or not public.appointment_patient_access('update', current_row.patient_id) then
    raise exception 'Permission denied for appointment update' using errcode = '42501';
  end if;
  if appointment_consultation_type not in ('in_person','online') or next_status not in ('scheduled','confirmed','completed','cancelled','rescheduled','no_show') then
    raise exception 'Choose valid appointment details.';
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
      updated_by = auth.uid()
  where id = target_appointment;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, previous_status, next_status, previous_start_at, next_start_at, remarks)
  values (target_appointment, auth.uid(), action_name, current_row.status, next_status, current_row.start_at, appointment_start, nullif(trim(appointment_remarks), ''));

  perform public.log_doctor_appointment_patient_activity(target_appointment, current_row.patient_id, action_name, auth.uid(), jsonb_build_object('doctor_id', target_doctor, 'previous_doctor_id', current_row.doctor_id, 'previous_start_at', current_row.start_at, 'start_at', appointment_start, 'status', next_status));
  return target_appointment;
end $$;

create or replace function public.update_doctor_appointment_status(target_appointment uuid, next_status text, status_remarks text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.doctor_appointments%rowtype;
  action_name text;
begin
  select * into current_row from public.doctor_appointments where id = target_appointment and deleted_at is null;
  if current_row.id is null then
    raise exception 'Appointment unavailable.';
  end if;
  if auth.uid() is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if next_status = 'cancelled' and not public.appointment_patient_access('cancel', current_row.patient_id) then
    raise exception 'Permission denied for cancellation' using errcode = '42501';
  end if;
  if next_status <> 'cancelled' and not public.appointment_patient_access('update_status', current_row.patient_id) then
    raise exception 'Permission denied for appointment update' using errcode = '42501';
  end if;
  if next_status not in ('scheduled','confirmed','completed','cancelled','rescheduled','no_show') then
    raise exception 'Choose a valid appointment status.';
  end if;

  update public.doctor_appointments
  set status = next_status,
      remarks = coalesce(nullif(trim(status_remarks), ''), remarks),
      updated_by = auth.uid()
  where id = target_appointment;

  action_name := case next_status
    when 'confirmed' then 'appointment_confirmed'
    when 'completed' then 'appointment_completed'
    when 'cancelled' then 'appointment_cancelled'
    when 'no_show' then 'appointment_marked_no_show'
    else 'appointment_status_updated'
  end;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, previous_status, next_status, previous_start_at, next_start_at, remarks)
  values (target_appointment, auth.uid(), 'status_changed', current_row.status, next_status, current_row.start_at, current_row.start_at, nullif(trim(status_remarks), ''));

  perform public.log_doctor_appointment_patient_activity(target_appointment, current_row.patient_id, action_name, auth.uid(), jsonb_build_object('doctor_id', current_row.doctor_id, 'status', next_status, 'start_at', current_row.start_at));
  perform public.notify_user(auth.uid(), 'Appointment ' || replace(next_status, '_', ' '), 'Doctor appointment status was updated.', 'doctor_appointment_' || next_status, target_appointment, '/admin/doctor-scheduling?appointment=' || target_appointment::text, auth.uid(), 'appointments', case when next_status = 'cancelled' then 'high' else 'normal' end, 'none', next_status = 'cancelled', jsonb_build_object('appointment_id', target_appointment, 'patient_id', current_row.patient_id, 'status', next_status));
  return target_appointment;
end $$;

create or replace function public.reschedule_doctor_appointment(target_appointment uuid, appointment_start timestamptz, appointment_end timestamptz, status_remarks text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.doctor_appointments%rowtype;
begin
  select * into current_row from public.doctor_appointments where id = target_appointment and deleted_at is null;
  if current_row.id is null then
    raise exception 'Appointment unavailable.';
  end if;
  if auth.uid() is null or not public.appointment_patient_access('reschedule', current_row.patient_id) then
    raise exception 'Permission denied for rescheduling' using errcode = '42501';
  end if;
  if current_row.status = 'cancelled' then
    raise exception 'Cancelled appointments cannot be rescheduled.';
  end if;
  if not public.doctor_slot_is_available(current_row.doctor_id, appointment_start, appointment_end, target_appointment) then
    raise exception 'This doctor is not available for the selected slot.';
  end if;

  update public.doctor_appointments
  set start_at = appointment_start,
      end_at = appointment_end,
      status = 'rescheduled',
      remarks = coalesce(nullif(trim(status_remarks), ''), remarks),
      updated_by = auth.uid()
  where id = target_appointment;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, previous_status, next_status, previous_start_at, next_start_at, remarks)
  values (target_appointment, auth.uid(), 'rescheduled', current_row.status, 'rescheduled', current_row.start_at, appointment_start, nullif(trim(status_remarks), ''));

  perform public.log_doctor_appointment_patient_activity(target_appointment, current_row.patient_id, 'appointment_rescheduled', auth.uid(), jsonb_build_object('doctor_id', current_row.doctor_id, 'previous_start_at', current_row.start_at, 'start_at', appointment_start));
  perform public.notify_user(auth.uid(), 'Appointment rescheduled', 'Doctor appointment time was changed.', 'doctor_appointment_rescheduled', target_appointment, '/admin/doctor-scheduling?appointment=' || target_appointment::text, auth.uid(), 'appointments', 'high', 'none', true, jsonb_build_object('appointment_id', target_appointment, 'patient_id', current_row.patient_id));
  return target_appointment;
end $$;

create or replace function public.delete_doctor_appointment(target_appointment uuid, delete_remarks text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.doctor_appointments%rowtype;
begin
  select * into current_row from public.doctor_appointments where id = target_appointment and deleted_at is null;
  if current_row.id is null then
    raise exception 'Appointment unavailable.';
  end if;
  if auth.uid() is null or not public.appointment_patient_access('delete', current_row.patient_id) then
    raise exception 'Permission denied for appointment deletion' using errcode = '42501';
  end if;

  update public.doctor_appointments
  set deleted_at = now(),
      deleted_by = auth.uid(),
      updated_by = auth.uid(),
      remarks = coalesce(nullif(trim(delete_remarks), ''), remarks)
  where id = target_appointment;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, previous_status, next_status, previous_start_at, next_start_at, remarks)
  values (target_appointment, auth.uid(), 'deleted', current_row.status, current_row.status, current_row.start_at, current_row.start_at, nullif(trim(delete_remarks), ''));

  perform public.log_doctor_appointment_patient_activity(target_appointment, current_row.patient_id, 'appointment_deleted', auth.uid(), jsonb_build_object('doctor_id', current_row.doctor_id, 'start_at', current_row.start_at));
  return target_appointment;
end $$;

grant execute on function public.create_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.update_doctor_appointment(uuid, uuid, timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.update_doctor_appointment_status(uuid, text, text) to authenticated;
grant execute on function public.reschedule_doctor_appointment(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.delete_doctor_appointment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
