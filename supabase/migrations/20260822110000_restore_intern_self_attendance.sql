-- Restore the canonical personal-attendance permission for the Intern role.
-- This does not grant company attendance visibility or management rights.
insert into public.permissions(code, description) values
  ('attendance.self', 'Manage own attendance')
on conflict (code) do update set description = excluded.description;

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
    select 'Intern'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = 'attendance.self'
    on conflict do nothing;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_permissions'
      and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = case role.code
      when 'intern' then 'attendance.self'
    end
    where role.code = 'intern'
    on conflict do nothing;
  end if;
end $$;
