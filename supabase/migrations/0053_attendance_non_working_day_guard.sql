-- Enforce company working-day, holiday, and approved-leave rules for attendance.
create or replace function public.enforce_attendance_workday() returns trigger language plpgsql security definer set search_path=public as $$
declare allowed_days integer[];
begin
  if new.clock_in is null then return new; end if;
  select working_days into allowed_days from public.company_attendance_settings where id=true;
  if not coalesce(extract(isodow from new.work_date)::integer = any(allowed_days), false) then raise exception 'Clock-in is unavailable on a non-working day'; end if;
  if exists(select 1 from public.holidays where holiday_date=new.work_date and is_active=true) then raise exception 'Clock-in is unavailable on a company holiday'; end if;
  if exists(select 1 from public.leave_requests where profile_id=new.profile_id and status='approved' and starts_on<=new.work_date and ends_on>=new.work_date) then raise exception 'Clock-in is unavailable while approved leave is active'; end if;
  return new;
end $$;
drop trigger if exists attendance_enforce_workday on public.attendance;
create trigger attendance_enforce_workday before insert or update of work_date,clock_in on public.attendance for each row execute function public.enforce_attendance_workday();
