-- Keep the canonical host validation, but make its explicit meetings.host
-- permission authoritative instead of implicitly restricting hosts by role.
create or replace function public.meeting_host_allowed(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = candidate
      and profile.status = 'active'
      and profile.is_employee
      and profile.workforce_visible
      and public.has_permission('meetings.host', profile.id)
  )
$$;


