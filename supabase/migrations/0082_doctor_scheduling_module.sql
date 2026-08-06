-- Minimal outsourced doctor scheduling: availability, blocked periods, appointments, and activity.

create extension if not exists btree_gist;

insert into public.permissions(code, description) values
  ('doctor_scheduling.view', 'View Doctor Scheduling'),
  ('doctor_scheduling.manage_doctors', 'Manage outsourced doctor profiles and availability'),
  ('doctor_scheduling.create_appointments', 'Create doctor appointments'),
  ('doctor_scheduling.update_appointments', 'Update and reschedule doctor appointments'),
  ('doctor_scheduling.cancel_appointments', 'Cancel doctor appointments')
on conflict(code) do update set description = excluded.description;

do $$
declare
  full_access text[] := array[
    'doctor_scheduling.view',
    'doctor_scheduling.manage_doctors',
    'doctor_scheduling.create_appointments',
    'doctor_scheduling.update_appointments',
    'doctor_scheduling.cancel_appointments'
  ];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = any(full_access)
    where role.code in ('chairman','director','general_manager')
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select baseline.role_name::public.employee_role, permission.id
    from (values ('Chairman'), ('Director'), ('General Manager')) as baseline(role_name)
    join public.permissions permission on permission.code = any(full_access)
    on conflict do nothing;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'designation_permission_bundles') then
    insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
    select bundle.id, permission.id
    from public.designation_permission_bundles bundle
    join public.permissions permission on permission.code = any(full_access)
    where bundle.name = 'Administration Admin'
    on conflict do nothing;
  end if;
end $$;

create table if not exists public.outsourced_doctors (
  id uuid primary key default gen_random_uuid(),
  doctor_name text not null check (char_length(trim(doctor_name)) between 2 and 120),
  specialization text not null check (char_length(trim(specialization)) between 2 and 120),
  qualification text not null check (char_length(trim(qualification)) between 2 and 160),
  phone text not null check (char_length(trim(phone)) between 6 and 30),
  consultation_duration_minutes integer not null default 30 check (consultation_duration_minutes between 5 and 240),
  status text not null default 'active' check (status in ('active','unavailable')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.outsourced_doctors(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create table if not exists public.doctor_blocked_periods (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.outsourced_doctors(id) on delete cascade,
  blocked_date date not null,
  start_time time,
  end_time time,
  reason text check (reason is null or char_length(reason) <= 250),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time < end_time))
);

create table if not exists public.doctor_appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references public.outsourced_doctors(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  consultation_type text not null default 'in_person' check (consultation_type in ('in_person','online')),
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','cancelled','rescheduled','no_show')),
  remarks text check (remarks is null or char_length(remarks) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at)
);

create table if not exists public.doctor_appointment_activity (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.doctor_appointments(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_status text,
  next_status text,
  previous_start_at timestamptz,
  next_start_at timestamptz,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists outsourced_doctors_status_idx on public.outsourced_doctors(status);
create index if not exists doctor_weekly_availability_doctor_day_idx on public.doctor_weekly_availability(doctor_id, day_of_week, start_time);
create index if not exists doctor_blocked_periods_doctor_date_idx on public.doctor_blocked_periods(doctor_id, blocked_date);
create index if not exists doctor_appointments_doctor_start_idx on public.doctor_appointments(doctor_id, start_at);
create index if not exists doctor_appointments_patient_start_idx on public.doctor_appointments(patient_id, start_at desc);
create index if not exists doctor_appointments_status_idx on public.doctor_appointments(status);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'doctor_appointments_no_overlap'
      and conrelid = 'public.doctor_appointments'::regclass
  ) then
    alter table public.doctor_appointments
      add constraint doctor_appointments_no_overlap
      exclude using gist (
        doctor_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status in ('scheduled','confirmed','completed','rescheduled','no_show'));
  end if;
end $$;

drop trigger if exists outsourced_doctors_touch_updated_at on public.outsourced_doctors;
create trigger outsourced_doctors_touch_updated_at before update on public.outsourced_doctors for each row execute function public.touch_updated_at();
drop trigger if exists doctor_appointments_touch_updated_at on public.doctor_appointments;
create trigger doctor_appointments_touch_updated_at before update on public.doctor_appointments for each row execute function public.touch_updated_at();

alter table public.outsourced_doctors enable row level security;
alter table public.doctor_weekly_availability enable row level security;
alter table public.doctor_blocked_periods enable row level security;
alter table public.doctor_appointments enable row level security;
alter table public.doctor_appointment_activity enable row level security;

grant select, insert, update on public.outsourced_doctors to authenticated;
grant select, insert, update, delete on public.doctor_weekly_availability to authenticated;
grant select, insert, update, delete on public.doctor_blocked_periods to authenticated;
grant select, insert, update on public.doctor_appointments to authenticated;
grant select, insert on public.doctor_appointment_activity to authenticated;

drop policy if exists "doctor scheduling doctors view" on public.outsourced_doctors;
create policy "doctor scheduling doctors view" on public.outsourced_doctors for select to authenticated using (public.has_permission('doctor_scheduling.view'));
drop policy if exists "doctor scheduling doctors manage" on public.outsourced_doctors;
create policy "doctor scheduling doctors manage" on public.outsourced_doctors for all to authenticated using (public.has_permission('doctor_scheduling.manage_doctors')) with check (public.has_permission('doctor_scheduling.manage_doctors'));

drop policy if exists "doctor scheduling availability view" on public.doctor_weekly_availability;
create policy "doctor scheduling availability view" on public.doctor_weekly_availability for select to authenticated using (public.has_permission('doctor_scheduling.view'));
drop policy if exists "doctor scheduling availability manage" on public.doctor_weekly_availability;
create policy "doctor scheduling availability manage" on public.doctor_weekly_availability for all to authenticated using (public.has_permission('doctor_scheduling.manage_doctors')) with check (public.has_permission('doctor_scheduling.manage_doctors'));

drop policy if exists "doctor scheduling blocked view" on public.doctor_blocked_periods;
create policy "doctor scheduling blocked view" on public.doctor_blocked_periods for select to authenticated using (public.has_permission('doctor_scheduling.view'));
drop policy if exists "doctor scheduling blocked manage" on public.doctor_blocked_periods;
create policy "doctor scheduling blocked manage" on public.doctor_blocked_periods for all to authenticated using (public.has_permission('doctor_scheduling.manage_doctors')) with check (public.has_permission('doctor_scheduling.manage_doctors'));

drop policy if exists "doctor scheduling appointments view" on public.doctor_appointments;
create policy "doctor scheduling appointments view" on public.doctor_appointments for select to authenticated using (
  public.has_permission('doctor_scheduling.view')
  and exists (select 1 from public.patients patient where patient.id = patient_id and patient.deleted_at is null)
);
drop policy if exists "doctor scheduling appointments create" on public.doctor_appointments;
create policy "doctor scheduling appointments create" on public.doctor_appointments for insert to authenticated with check (public.has_permission('doctor_scheduling.create_appointments') and created_by = auth.uid());
drop policy if exists "doctor scheduling appointments update" on public.doctor_appointments;
create policy "doctor scheduling appointments update" on public.doctor_appointments for update to authenticated using (public.has_permission('doctor_scheduling.update_appointments') or public.has_permission('doctor_scheduling.cancel_appointments')) with check (public.has_permission('doctor_scheduling.update_appointments') or public.has_permission('doctor_scheduling.cancel_appointments'));

drop policy if exists "doctor scheduling activity view" on public.doctor_appointment_activity;
create policy "doctor scheduling activity view" on public.doctor_appointment_activity for select to authenticated using (
  public.has_permission('doctor_scheduling.view')
  and exists (select 1 from public.doctor_appointments appointment where appointment.id = appointment_id)
);
drop policy if exists "doctor scheduling activity insert" on public.doctor_appointment_activity;
create policy "doctor scheduling activity insert" on public.doctor_appointment_activity for insert to authenticated with check (actor_id = auth.uid() and (public.has_permission('doctor_scheduling.create_appointments') or public.has_permission('doctor_scheduling.update_appointments') or public.has_permission('doctor_scheduling.cancel_appointments')));

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
  if auth.uid() is null or not public.has_permission('doctor_scheduling.create_appointments') then
    raise exception 'Permission denied for appointment creation' using errcode = '42501';
  end if;

  if appointment_consultation_type not in ('in_person','online') then
    raise exception 'Choose a valid consultation type.';
  end if;

  if not exists (select 1 from public.patients patient where patient.id = target_patient and patient.deleted_at is null) then
    raise exception 'Patient unavailable.';
  end if;

  if not public.doctor_slot_is_available(target_doctor, appointment_start, appointment_end, null) then
    raise exception 'This doctor is not available for the selected slot.';
  end if;

  insert into public.doctor_appointments(patient_id, doctor_id, start_at, end_at, consultation_type, remarks, created_by, updated_by)
  values (target_patient, target_doctor, appointment_start, appointment_end, appointment_consultation_type, nullif(trim(appointment_remarks), ''), auth.uid(), auth.uid())
  returning id into new_id;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, next_status, next_start_at, remarks)
  values (new_id, auth.uid(), 'created', 'scheduled', appointment_start, nullif(trim(appointment_remarks), ''));

  perform public.notify_user(auth.uid(), 'Appointment created', 'Doctor appointment has been scheduled.', 'doctor_appointment_created', new_id, '/admin/doctor-scheduling?appointment=' || new_id::text, auth.uid(), 'appointments', 'normal', 'none', false, jsonb_build_object('appointment_id', new_id));
  return new_id;
end $$;

create or replace function public.update_doctor_appointment_status(target_appointment uuid, next_status text, status_remarks text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.doctor_appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if next_status = 'cancelled' and not public.has_permission('doctor_scheduling.cancel_appointments') then
    raise exception 'Permission denied for cancellation' using errcode = '42501';
  end if;
  if next_status <> 'cancelled' and not public.has_permission('doctor_scheduling.update_appointments') then
    raise exception 'Permission denied for appointment update' using errcode = '42501';
  end if;
  if next_status not in ('scheduled','confirmed','completed','cancelled','rescheduled','no_show') then
    raise exception 'Choose a valid appointment status.';
  end if;

  select * into current_row from public.doctor_appointments where id = target_appointment;
  if current_row.id is null then
    raise exception 'Appointment unavailable.';
  end if;

  update public.doctor_appointments
  set status = next_status,
      remarks = coalesce(nullif(trim(status_remarks), ''), remarks),
      updated_by = auth.uid()
  where id = target_appointment;

  insert into public.doctor_appointment_activity(appointment_id, actor_id, action, previous_status, next_status, previous_start_at, next_start_at, remarks)
  values (target_appointment, auth.uid(), 'status_changed', current_row.status, next_status, current_row.start_at, current_row.start_at, nullif(trim(status_remarks), ''));

  perform public.notify_user(auth.uid(), 'Appointment ' || replace(next_status, '_', ' '), 'Doctor appointment status was updated.', 'doctor_appointment_' || next_status, target_appointment, '/admin/doctor-scheduling?appointment=' || target_appointment::text, auth.uid(), 'appointments', case when next_status = 'cancelled' then 'high' else 'normal' end, 'none', next_status = 'cancelled', jsonb_build_object('appointment_id', target_appointment, 'status', next_status));
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
  if auth.uid() is null or not public.has_permission('doctor_scheduling.update_appointments') then
    raise exception 'Permission denied for rescheduling' using errcode = '42501';
  end if;

  select * into current_row from public.doctor_appointments where id = target_appointment;
  if current_row.id is null then
    raise exception 'Appointment unavailable.';
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

  perform public.notify_user(auth.uid(), 'Appointment rescheduled', 'Doctor appointment time was changed.', 'doctor_appointment_rescheduled', target_appointment, '/admin/doctor-scheduling?appointment=' || target_appointment::text, auth.uid(), 'appointments', 'high', 'none', true, jsonb_build_object('appointment_id', target_appointment));
  return target_appointment;
end $$;

notify pgrst, 'reload schema';
