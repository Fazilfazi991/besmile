-- Minimal GM operational grants. Security/role administration is intentionally excluded.
insert into public.permissions(code, description) values
  ('employees.create', 'Create employees'), ('employees.edit', 'Edit ordinary employee details'), ('attendance.self', 'Manage own attendance')
on conflict (code) do update set description=excluded.description;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r join public.permissions p on p.code in ('employees.create','employees.edit','attendance.self') where r.code='general_manager' on conflict do nothing;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role,permission_id) select 'General Manager'::public.employee_role,p.id from public.permissions p where p.code in ('employees.create','employees.edit','attendance.self') on conflict do nothing;
  end if;
end $$;
