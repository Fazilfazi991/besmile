-- Overnight weekly availability: end < start means the following calendar day.
-- Schema/functions only; existing production rows, RLS and manager scope stay intact.
begin;
alter table public.doctor_weekly_availability drop constraint doctor_weekly_availability_check;
alter table public.doctor_weekly_availability add constraint doctor_weekly_availability_check
  check (start_time <> end_time and start_time < time '24:00');

create or replace function public.replace_clinician_availability(target_doctor uuid, ranges jsonb)
returns setof public.doctor_weekly_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  duration_minutes integer;
begin
  if (select auth.uid()) is null or not public.can_manage_clinician(target_doctor) then
    raise exception 'Permission denied for clinician availability' using errcode = '42501';
  end if;
  select consultation_duration_minutes into duration_minutes from public.outsourced_doctors where id=target_doctor for update;
  if jsonb_typeof(coalesce(ranges, '[]'::jsonb)) <> 'array' then
    raise exception 'Availability ranges must be an array.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(ranges, '[]'::jsonb)) as item(day_of_week integer, start_time time, end_time time)
    where item.day_of_week is null or item.day_of_week not between 0 and 6
       or item.start_time is null or item.end_time is null or item.start_time = item.end_time
       or item.start_time >= time '24:00'
       or extract(epoch from (item.end_time - item.start_time + case when item.end_time < item.start_time then interval '1 day' else interval '0' end)) < duration_minutes * 60
  ) then
    raise exception 'Choose valid availability ranges.';
  end if;
  if exists (
    with weekly as (
      select position, (value->>'day_of_week')::integer * 86400 + extract(epoch from (value->>'start_time')::time) as starts,
        (value->>'day_of_week')::integer * 86400 + extract(epoch from (value->>'end_time')::time)
          + case when (value->>'end_time')::time < (value->>'start_time')::time then 86400 else 0 end as ends
      from jsonb_array_elements(coalesce(ranges, '[]'::jsonb)) with ordinality item(value, position)
    )
    select 1 from weekly first_range join weekly second_range on first_range.position < second_range.position
    cross join (values (-604800), (0), (604800)) week_shift(seconds)
    where first_range.starts < second_range.ends + week_shift.seconds
      and second_range.starts + week_shift.seconds < first_range.ends
  ) then
    raise exception 'Availability ranges cannot overlap, including on the next day.';
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
create or replace function public.doctor_slot_is_available(target_doctor uuid, proposed_start timestamptz, proposed_end timestamptz, ignored_appointment uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare app_timezone text := public.business_timezone(); local_start timestamp; local_end timestamp;
begin
  if proposed_start is null or proposed_end is null or proposed_start <= now() or proposed_start >= proposed_end then return false; end if;
  local_start := proposed_start at time zone app_timezone;
  local_end := proposed_end at time zone app_timezone;
  return exists (select 1 from public.outsourced_doctors doctor where doctor.id=target_doctor and doctor.status='active')
    and exists (
      select 1 from public.doctor_weekly_availability availability
      cross join (values (local_start::date), (local_start::date - 1)) origin(day)
      where availability.doctor_id=target_doctor and availability.day_of_week=extract(dow from origin.day)::integer
        and availability.start_time <> availability.end_time
        and local_start >= origin.day + availability.start_time
        and local_end <= origin.day + availability.end_time
          + case when availability.end_time < availability.start_time then interval '1 day' else interval '0' end
    )
    and not exists (
      select 1 from public.doctor_blocked_periods blocked where blocked.doctor_id=target_doctor
        and blocked.blocked_date between local_start::date and local_end::date
        and tstzrange((blocked.blocked_date + coalesce(blocked.start_time,time '00:00')) at time zone app_timezone,
          (case when blocked.start_time is null or blocked.end_time is null then blocked.blocked_date + interval '1 day'
             else blocked.blocked_date + blocked.end_time end) at time zone app_timezone,'[)') && tstzrange(proposed_start,proposed_end,'[)')
    )
    and not exists (select 1 from public.doctor_appointments appointment where appointment.doctor_id=target_doctor and appointment.deleted_at is null
      and appointment.status in ('scheduled','confirmed','completed','rescheduled','no_show')
      and (ignored_appointment is null or appointment.id<>ignored_appointment)
      and tstzrange(appointment.start_at,appointment.end_at,'[)') && tstzrange(proposed_start,proposed_end,'[)'));
end $$;

notify pgrst, 'reload schema';
commit;
