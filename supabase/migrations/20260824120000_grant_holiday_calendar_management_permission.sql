-- Production compatibility for the canonical legacy role_permissions(role, permission_id) layout.
do $$
declare
  holiday_permission_id uuid;
begin
  select id into holiday_permission_id
  from public.permissions
  where code = 'holiday_calendar.manage';

  if holiday_permission_id is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'role_permissions'
        and column_name = 'role'
    ) then
    insert into public.role_permissions (role, permission_id)
    select role_code::public.employee_role, holiday_permission_id
    from unnest(array['Chairman', 'Director', 'General Manager']) as role_code
    where not exists (
      select 1
      from public.role_permissions rp
      where rp.role = role_code::public.employee_role
        and rp.permission_id = holiday_permission_id
    );
  end if;
end;
$$;
