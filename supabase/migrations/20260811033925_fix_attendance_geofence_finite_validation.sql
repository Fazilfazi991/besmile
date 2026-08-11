-- PostgreSQL does not support the isfinite helper for double precision. Keep finite-value
-- validation explicit while preserving the original authenticated geofence flow.
create or replace function public.record_self_attendance_location(
  p_action text, p_latitude double precision, p_longitude double precision, p_accuracy_metres double precision
) returns public.attendance
language plpgsql security definer set search_path=public as $$
declare settings public.company_attendance_settings; distance_metres double precision; row public.attendance; workday date;
begin
  if auth.uid() is null or not public.profile_is_employee(auth.uid()) then raise exception 'Only active employees can record self-attendance'; end if;
  if p_action not in ('clock_in','clock_out') then raise exception 'Invalid attendance action'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy_metres is null
    or p_latitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    or p_longitude in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    or p_accuracy_metres in ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy_metres < 0
  then raise exception 'A valid location reading is required for attendance'; end if;
  select * into settings from public.company_attendance_settings where id=true;
  if settings.office_latitude is null or settings.office_longitude is null then raise exception 'Attendance location is not configured'; end if;
  if p_accuracy_metres > settings.attendance_max_accuracy_metres then raise exception 'We could not verify your location accurately. Please move to an area with a better GPS signal and try again.'; end if;
  distance_metres := 6371000 * 2 * asin(sqrt(power(sin(radians(p_latitude-settings.office_latitude)/2),2) + cos(radians(settings.office_latitude))*cos(radians(p_latitude))*power(sin(radians(p_longitude-settings.office_longitude)/2),2)));
  if distance_metres > settings.attendance_geofence_radius_metres then raise exception 'You are % metres from the office. Attendance is available within % metres.', round(distance_metres), settings.attendance_geofence_radius_metres; end if;
  workday := (now() at time zone settings.timezone)::date;
  if p_action='clock_in' then
    insert into public.attendance(profile_id,work_date,clock_in,status,clock_in_latitude,clock_in_longitude,clock_in_accuracy_metres,clock_in_distance_metres,clock_in_location_verified)
    values(auth.uid(),workday,now(),'present',p_latitude,p_longitude,p_accuracy_metres,distance_metres,true) returning * into row;
  else
    select * into row from public.attendance where profile_id=auth.uid() and work_date=workday and clock_out is null for update;
    if not found then raise exception 'No open attendance record was found for today'; end if;
    if exists(select 1 from public.attendance_breaks where attendance_id=row.id and ended_at is null) then raise exception 'End your active break before clocking out.'; end if;
    update public.attendance set clock_out=now(), break_minutes=coalesce(break_minutes,0), clock_out_latitude=p_latitude, clock_out_longitude=p_longitude, clock_out_accuracy_metres=p_accuracy_metres, clock_out_distance_metres=distance_metres, clock_out_location_verified=true where id=row.id returning * into row;
  end if;
  return row;
end $$;

revoke all on function public.record_self_attendance_location(text,double precision,double precision,double precision) from public, anon;
grant execute on function public.record_self_attendance_location(text,double precision,double precision,double precision) to authenticated;
