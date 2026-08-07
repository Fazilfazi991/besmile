-- A General Manager remains an employee for attendance purposes while retaining
-- their separate company-wide attendance visibility.
insert into public.permissions(code, description) values
  ('attendance.self', 'Manage own attendance'),
  ('attendance.view', 'View attendance')
on conflict(code) do update set description = excluded.description;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code in ('attendance.self', 'attendance.view')
    where role.code = 'general_manager'
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code in ('attendance.self', 'attendance.view')
    on conflict do nothing;
  end if;
end $$;
