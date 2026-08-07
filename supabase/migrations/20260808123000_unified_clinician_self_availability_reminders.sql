-- Unified clinician self-service, scoped appointment notifications, and reminder delivery.
-- The legacy outsourced_doctors table remains the physical clinician registry so existing
-- appointment and availability foreign keys stay compatible and no scheduling data moves.

alter table public.profiles add column if not exists is_employee boolean not null default true;
comment on column public.profiles.is_employee is 'True only for staff participating in HR, attendance, leave and payroll. Authenticated outsourced clinicians are false.';

create or replace function public.protect_profile_employee_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_employee is distinct from new.is_employee
    and old.id = (select auth.uid())
    and not public.has_permission('employees.manage') then
    raise exception 'Employment classification cannot be changed from self-service.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.protect_profile_employee_classification() from public, anon, authenticated;
drop trigger if exists profiles_protect_employee_classification on public.profiles;
create trigger profiles_protect_employee_classification before update of is_employee on public.profiles
for each row execute function public.protect_profile_employee_classification();

alter table public.outsourced_doctors add column if not exists profile_id uuid references public.profiles(id) on delete set null;
alter table public.outsourced_doctors add column if not exists clinician_type text not null default 'outsourced';
alter table public.outsourced_doctors add column if not exists self_service_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outsourced_doctors_clinician_type_check'
      and conrelid = 'public.outsourced_doctors'::regclass
  ) then
    alter table public.outsourced_doctors
      add constraint outsourced_doctors_clinician_type_check
      check (clinician_type in ('staff_psychologist','psychology_intern','outsourced'));
  end if;
end $$;

create unique index if not exists outsourced_doctors_profile_id_unique_idx
  on public.outsourced_doctors(profile_id) where profile_id is not null;
create index if not exists outsourced_doctors_type_active_idx
  on public.outsourced_doctors(clinician_type, status) where archived_at is null;

-- Staff clinician rows are linked only by profile UUID. No name/email inference is used.
insert into public.outsourced_doctors(
  doctor_name, specialization, qualification, phone, email,
  consultation_duration_minutes, status, profile_id, clinician_type
)
select
  profile.full_name,
  'Psychology',
  coalesce(nullif(trim(profile.designation), ''), 'Psychologist'),
  coalesce(nullif(trim(profile.phone), ''), 'Not provided'),
  profile.email,
  30,
  'active',
  profile.id,
  case when lower(coalesce(profile.designation, '')) like '%intern%'
    then 'psychology_intern' else 'staff_psychologist' end
from public.profiles profile
where profile.status = 'active'
  and profile.is_employee
  and (
    profile.role::text = 'psychologist'
    or lower(coalesce(profile.designation, '')) like '%psychologist%'
    or lower(coalesce(profile.designation, '')) = 'psychology intern'
  )
  and not exists (
    select 1 from public.outsourced_doctors clinician where clinician.profile_id = profile.id
  );

insert into public.permissions(code, description) values
  ('clinician.schedule.view_own', 'View own clinician schedule'),
  ('clinician.availability.manage_own', 'Manage own clinician availability'),
  ('clinician.appointments.view_own', 'View own assigned appointments')
on conflict(code) do update set description = excluded.description;

create or replace function public.current_clinician_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select clinician.id
  from public.outsourced_doctors clinician
  where clinician.profile_id = (select auth.uid())
    and clinician.self_service_enabled
    and clinician.archived_at is null
  limit 1
$$;

revoke execute on function public.current_clinician_id() from public, anon;
grant execute on function public.current_clinician_id() to authenticated, service_role;

create or replace function public.can_manage_clinician(target_doctor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.has_permission('doctor_scheduling.manage_doctors'))
    or target_doctor = (select public.current_clinician_id())
$$;

revoke execute on function public.can_manage_clinician(uuid) from public, anon;
grant execute on function public.can_manage_clinician(uuid) to authenticated, service_role;

drop policy if exists "doctor scheduling doctors view" on public.outsourced_doctors;
create policy "doctor scheduling doctors view" on public.outsourced_doctors for select to authenticated using (
  id = (select public.current_clinician_id())
  or public.appointment_has_permission('view')
  or public.appointment_has_permission('create')
  or public.appointment_has_permission('update')
  or public.appointment_has_permission('reschedule')
);

drop policy if exists "doctor scheduling availability view" on public.doctor_weekly_availability;
create policy "doctor scheduling availability view" on public.doctor_weekly_availability for select to authenticated using (
  doctor_id = (select public.current_clinician_id())
  or public.appointment_has_permission('view')
  or public.appointment_has_permission('create')
  or public.appointment_has_permission('update')
  or public.appointment_has_permission('reschedule')
);
drop policy if exists "doctor scheduling availability manage" on public.doctor_weekly_availability;
create policy "doctor scheduling availability manage" on public.doctor_weekly_availability for all to authenticated
using (public.can_manage_clinician(doctor_id))
with check (public.can_manage_clinician(doctor_id) and created_by = (select auth.uid()));

drop policy if exists "doctor scheduling blocked view" on public.doctor_blocked_periods;
create policy "doctor scheduling blocked view" on public.doctor_blocked_periods for select to authenticated using (
  doctor_id = (select public.current_clinician_id())
  or public.appointment_has_permission('view')
  or public.appointment_has_permission('create')
  or public.appointment_has_permission('update')
  or public.appointment_has_permission('reschedule')
);
drop policy if exists "doctor scheduling blocked manage" on public.doctor_blocked_periods;
create policy "doctor scheduling blocked manage" on public.doctor_blocked_periods for all to authenticated
using (
  public.has_permission('doctor_scheduling.manage_doctors')
  or (doctor_id = (select public.current_clinician_id()) and blocked_date >= current_date)
)
with check (
  public.has_permission('doctor_scheduling.manage_doctors')
  or (doctor_id = (select public.current_clinician_id()) and blocked_date >= current_date and created_by = (select auth.uid()))
);

drop policy if exists "doctor scheduling appointments view" on public.doctor_appointments;
create policy "doctor scheduling appointments view" on public.doctor_appointments for select to authenticated using (
  deleted_at is null
  and (
    doctor_id = (select public.current_clinician_id())
    or public.appointment_patient_access('view', patient_id)
  )
);

drop policy if exists "doctor scheduling activity view" on public.doctor_appointment_activity;
create policy "doctor scheduling activity view" on public.doctor_appointment_activity for select to authenticated using (
  exists (
    select 1 from public.doctor_appointments appointment
    where appointment.id = appointment_id
      and appointment.deleted_at is null
      and (
        appointment.doctor_id = (select public.current_clinician_id())
        or public.appointment_patient_access('view', appointment.patient_id)
      )
  )
);

drop policy if exists "patients assigned clinician appointment access" on public.patients;
create policy "patients assigned clinician appointment access" on public.patients for select to authenticated using (
  deleted_at is null
  and exists (
    select 1 from public.doctor_appointments appointment
    where appointment.patient_id = patients.id
      and appointment.doctor_id = (select public.current_clinician_id())
      and appointment.deleted_at is null
  )
);

create or replace function public.replace_clinician_availability(target_doctor uuid, ranges jsonb)
returns setof public.doctor_weekly_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  if (select auth.uid()) is null or not public.can_manage_clinician(target_doctor) then
    raise exception 'Permission denied for clinician availability' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(ranges, '[]'::jsonb)) <> 'array' then
    raise exception 'Availability ranges must be an array.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(ranges, '[]'::jsonb)) as item(day_of_week integer, start_time time, end_time time)
    where item.day_of_week not between 0 and 6 or item.start_time >= item.end_time
  ) then
    raise exception 'Choose valid availability ranges.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(ranges, '[]'::jsonb)) with ordinality first_range(value, position)
    join jsonb_array_elements(coalesce(ranges, '[]'::jsonb)) with ordinality second_range(value, position)
      on first_range.position < second_range.position
     and (first_range.value->>'day_of_week')::integer = (second_range.value->>'day_of_week')::integer
     and (first_range.value->>'start_time')::time < (second_range.value->>'end_time')::time
     and (second_range.value->>'start_time')::time < (first_range.value->>'end_time')::time
  ) then
    raise exception 'Availability ranges cannot overlap.';
  end if;

  delete from public.doctor_weekly_availability where doctor_id = target_doctor;
  insert into public.doctor_weekly_availability(doctor_id, day_of_week, start_time, end_time, created_by)
  select target_doctor, item.day_of_week, item.start_time, item.end_time, (select auth.uid())
  from jsonb_to_recordset(coalesce(ranges, '[]'::jsonb)) as item(day_of_week integer, start_time time, end_time time);

  select profile_id into recipient from public.outsourced_doctors where id = target_doctor;
  if recipient is not null and recipient is distinct from (select auth.uid()) then
    perform public.notify_user(recipient, 'Availability updated', 'Your weekly clinician availability was updated.', 'clinician_availability_updated', null, case when (select is_employee from public.profiles where id = recipient) then '/employee/doctor-scheduling' else '/clinician/schedule' end, (select auth.uid()), 'appointments', 'normal', 'none', false, jsonb_build_object('clinician_id', target_doctor));
  end if;

  return query
  select availability.* from public.doctor_weekly_availability availability
  where availability.doctor_id = target_doctor
  order by availability.day_of_week, availability.start_time;
end $$;

revoke execute on function public.replace_clinician_availability(uuid, jsonb) from public, anon;
grant execute on function public.replace_clinician_availability(uuid, jsonb) to authenticated, service_role;

create table if not exists public.appointment_reminder_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  lead_minutes integer not null default 120 check (lead_minutes between 5 and 10080),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.appointment_reminder_settings(id) values (true) on conflict(id) do nothing;

create table if not exists public.appointment_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.doctor_appointments(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  appointment_start timestamptz not null,
  lead_minutes integer not null,
  notification_id uuid references public.notifications(id) on delete set null,
  delivered_at timestamptz not null default now(),
  unique(appointment_id, recipient_id, appointment_start, lead_minutes)
);
create index if not exists appointment_reminder_deliveries_recipient_idx on public.appointment_reminder_deliveries(recipient_id, delivered_at desc);

alter table public.appointment_reminder_settings enable row level security;
alter table public.appointment_reminder_deliveries enable row level security;
grant select, update on public.appointment_reminder_settings to authenticated;
grant select on public.appointment_reminder_deliveries to authenticated;
grant select, insert, update on public.appointment_reminder_settings to service_role;
grant select, insert, update, delete on public.appointment_reminder_deliveries to service_role;

create policy "appointment reminder settings readable" on public.appointment_reminder_settings
  for select to authenticated using (true);
create policy "appointment reminder settings managed" on public.appointment_reminder_settings
  for update to authenticated
  using (public.has_permission('doctor_scheduling.manage_doctors'))
  with check (public.has_permission('doctor_scheduling.manage_doctors'));
create policy "appointment reminder deliveries own" on public.appointment_reminder_deliveries
  for select to authenticated using (recipient_id = (select auth.uid()));

create or replace function public.clinician_notification_path(target_profile uuid, target_appointment uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(profile.is_employee, true)
    then '/employee/doctor-scheduling?appointment=' || target_appointment::text
    else '/clinician/schedule?appointment=' || target_appointment::text
  end
  from public.profiles profile where profile.id = target_profile
$$;
revoke execute on function public.clinician_notification_path(uuid, uuid) from public, anon;
grant execute on function public.clinician_notification_path(uuid, uuid) to authenticated, service_role;

create or replace function public.notify_clinician_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_recipient uuid;
  new_recipient uuid;
  event_type text;
  event_title text;
  event_body text;
begin
  select profile_id into new_recipient from public.outsourced_doctors where id = new.doctor_id;
  if tg_op = 'UPDATE' then
    select profile_id into old_recipient from public.outsourced_doctors where id = old.doctor_id;
  end if;

  if tg_op = 'INSERT' then
    event_type := 'doctor_appointment_assigned'; event_title := 'New appointment'; event_body := 'A new appointment has been assigned to you.';
  elsif new.doctor_id is distinct from old.doctor_id then
    event_type := 'doctor_appointment_reassigned'; event_title := 'Appointment assignment changed'; event_body := 'An appointment has been assigned to you.';
    if old_recipient is not null and old_recipient is distinct from (select auth.uid()) then
      perform public.notify_user(old_recipient, 'Appointment reassigned', 'An appointment is no longer assigned to you.', 'doctor_appointment_unassigned', new.id, public.clinician_notification_path(old_recipient, new.id), (select auth.uid()), 'appointments', 'high', 'standard', true, jsonb_build_object('appointment_id', new.id));
    end if;
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    event_type := 'doctor_appointment_cancelled'; event_title := 'Appointment cancelled'; event_body := 'An assigned appointment was cancelled.';
  elsif new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at then
    event_type := 'doctor_appointment_rescheduled'; event_title := 'Appointment rescheduled'; event_body := 'An assigned appointment time was changed.';
  else
    return new;
  end if;

  if new_recipient is not null and new_recipient is distinct from (select auth.uid()) then
    perform public.notify_user(new_recipient, event_title, event_body, event_type, new.id, public.clinician_notification_path(new_recipient, new.id), (select auth.uid()), 'appointments', case when event_type in ('doctor_appointment_cancelled','doctor_appointment_reassigned') then 'high' else 'normal' end, 'standard', event_type = 'doctor_appointment_cancelled', jsonb_build_object('appointment_id', new.id, 'patient_id', new.patient_id, 'start_at', new.start_at));
  end if;
  return new;
end $$;

revoke execute on function public.notify_clinician_appointment_change() from public, anon, authenticated;

drop trigger if exists doctor_appointments_notify_clinician on public.doctor_appointments;
create trigger doctor_appointments_notify_clinician
after insert or update of doctor_id, start_at, end_at, status on public.doctor_appointments
for each row execute function public.notify_clinician_appointment_change();

create or replace function public.notify_clinician_availability_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid; clinician uuid;
begin
  clinician := coalesce(new.doctor_id, old.doctor_id);
  select profile_id into recipient from public.outsourced_doctors where id = clinician;
  if recipient is not null and recipient is distinct from (select auth.uid()) then
    perform public.notify_user(recipient, 'Availability updated', 'Your clinician availability was updated.', 'clinician_availability_updated', null, case when (select is_employee from public.profiles where id = recipient) then '/employee/doctor-scheduling' else '/clinician/schedule' end, (select auth.uid()), 'appointments', 'normal', 'none', false, jsonb_build_object('clinician_id', clinician));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.notify_clinician_availability_change() from public, anon, authenticated;

drop trigger if exists doctor_weekly_availability_notify_clinician on public.doctor_weekly_availability;
drop trigger if exists doctor_blocked_periods_notify_clinician on public.doctor_blocked_periods;
create trigger doctor_blocked_periods_notify_clinician after insert or update or delete on public.doctor_blocked_periods for each row execute function public.notify_clinician_availability_change();

create or replace function public.run_appointment_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.appointment_reminder_settings%rowtype;
  candidate record;
  delivered integer := 0;
  delivery_id uuid;
begin
  select * into settings from public.appointment_reminder_settings where id = true;
  if settings.id is null or not settings.enabled then return 0; end if;

  for candidate in
    select appointment.id, appointment.patient_id, appointment.start_at, clinician.profile_id recipient_id
    from public.doctor_appointments appointment
    join public.outsourced_doctors clinician on clinician.id = appointment.doctor_id
    where clinician.profile_id is not null
      and appointment.deleted_at is null
      and appointment.status in ('scheduled','confirmed','rescheduled')
      and appointment.start_at > now()
      and appointment.start_at <= now() + make_interval(mins => settings.lead_minutes)
      and not exists (
        select 1 from public.appointment_reminder_deliveries delivery
        where delivery.appointment_id = appointment.id
          and delivery.recipient_id = clinician.profile_id
          and delivery.appointment_start = appointment.start_at
          and delivery.lead_minutes = settings.lead_minutes
      )
  loop
    delivery_id := null;
    insert into public.appointment_reminder_deliveries(appointment_id, recipient_id, appointment_start, lead_minutes, notification_id)
    values (candidate.id, candidate.recipient_id, candidate.start_at, settings.lead_minutes, null)
    on conflict do nothing returning id into delivery_id;
    if delivery_id is null then continue; end if;
    perform public.notify_user(candidate.recipient_id, 'Upcoming appointment', 'You have an upcoming assigned appointment.', 'doctor_appointment_reminder', candidate.id, public.clinician_notification_path(candidate.recipient_id, candidate.id), null, 'appointments', 'high', 'standard', true, jsonb_build_object('appointment_id', candidate.id, 'patient_id', candidate.patient_id, 'start_at', candidate.start_at, 'lead_minutes', settings.lead_minutes));
    delivered := delivered + 1;
  end loop;
  return delivered;
end $$;

revoke execute on function public.run_appointment_reminders() from public, anon, authenticated;
grant execute on function public.run_appointment_reminders() to service_role;

-- Supabase pg_cron is the only scheduler used for this database-owned reminder flow.
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bsmile-appointment-reminders') then
    perform cron.unschedule('bsmile-appointment-reminders');
  end if;
  perform cron.schedule('bsmile-appointment-reminders', '*/5 * * * *', 'select public.run_appointment_reminders();');
end $$;

alter table public.notification_preferences
  alter column category_settings set default '{"chat":{"in_app":true,"sound":true,"desktop":false},"tasks":{"in_app":true,"sound":true,"desktop":false},"leave":{"in_app":true,"sound":true,"desktop":false},"attendance":{"in_app":true,"sound":false,"desktop":false},"crm":{"in_app":true,"sound":true,"desktop":false},"finance":{"in_app":true,"sound":true,"desktop":false},"documents":{"in_app":true,"sound":false,"desktop":false},"announcements":{"in_app":true,"sound":true,"desktop":false},"security":{"in_app":true,"sound":true,"desktop":false},"appointments":{"in_app":true,"sound":true,"desktop":false}}'::jsonb;
update public.notification_preferences
set category_settings = category_settings || jsonb_build_object('appointments', coalesce(category_settings->'appointments', '{"in_app":true,"sound":true,"desktop":false}'::jsonb))
where not category_settings ? 'appointments';

-- Explicit Data API grants; RLS remains the authorization boundary.
grant select on public.outsourced_doctors, public.doctor_weekly_availability, public.doctor_blocked_periods, public.doctor_appointments, public.doctor_appointment_activity to authenticated;
revoke all on public.appointment_reminder_settings, public.appointment_reminder_deliveries from anon;

notify pgrst, 'reload schema';
