-- Meeting organizers need a small attendee projection without employees.view.
-- The Director remains available through the separate meeting-host path, but is
-- not listed in the ordinary workforce attendee selector.
create or replace function public.meeting_workforce()
returns table(id uuid, full_name text, designation text, department_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
    or not (public.has_permission('meetings.create') or public.has_permission('meetings.manage'))
    or not exists (
      select 1 from public.profiles caller
      where caller.id = (select auth.uid())
        and caller.is_employee
        and caller.workforce_visible
        and caller.status::text in ('active', 'intern', 'probation')
        and caller.removed_at is null
    ) then
    raise exception 'Permission denied for meeting attendee directory' using errcode = '42501';
  end if;

  return query
  select profile.id, profile.full_name, profile.designation, department.name
  from public.profiles profile
  left join public.departments department on department.id = profile.department_id
  where profile.is_employee
    and profile.workforce_visible
    and profile.status::text in ('active', 'intern', 'probation')
    and profile.removed_at is null
    and profile.role::text <> 'director'
  order by profile.full_name, profile.id;
end;
$$;

revoke all on function public.meeting_workforce() from public, anon;
grant execute on function public.meeting_workforce() to authenticated;
notify pgrst, 'reload schema';
