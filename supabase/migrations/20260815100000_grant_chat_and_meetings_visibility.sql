-- All active employee roles can use chat and view meetings. Creation remains
-- restricted to the existing meetings.create / meetings.manage permission grants.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select distinct profile.role::text::public.employee_role, permission.id
    from public.profiles profile
    join public.permissions permission on permission.code in ('chat.use', 'meetings.view')
    where profile.is_employee = true
      and profile.status::text in ('active', 'intern', 'probation')
    on conflict do nothing;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select distinct role.id, permission.id
    from public.profiles profile
    join public.roles role on role.code::text = profile.role::text
    join public.permissions permission on permission.code in ('chat.use', 'meetings.view')
    where profile.is_employee = true
      and profile.status::text in ('active', 'intern', 'probation')
    on conflict do nothing;
  else
    raise exception 'Unsupported role_permissions schema';
  end if;
end $$;
