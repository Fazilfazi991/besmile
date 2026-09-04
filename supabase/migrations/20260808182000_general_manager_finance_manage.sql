-- Business decision: every General Manager may complete Finance payments.
-- Use the role-permission layer so the capability applies consistently to all GMs.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'finance.manage'
    where role.code = 'general_manager'
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = 'finance.manage'
    on conflict do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
