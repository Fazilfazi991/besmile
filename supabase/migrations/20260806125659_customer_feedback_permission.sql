insert into public.permissions(code, description)
values ('customer_feedback.view', 'View customer feedback from the approved Google Sheet')
on conflict(code) do update set description = excluded.description;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'customer_feedback.view'
    where role.code in ('super_admin', 'chairman', 'director', 'general_manager')
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select baseline.role_name::public.employee_role, permission.id
    from (values ('Chairman'), ('Director'), ('General Manager')) as baseline(role_name)
    join public.permissions permission on permission.code = 'customer_feedback.view'
    on conflict do nothing;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'designation_permission_bundles') then
    insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
    select bundle.id, permission.id
    from public.designation_permission_bundles bundle
    join public.permissions permission on permission.code = 'customer_feedback.view'
    where bundle.name = 'Administration Admin'
    on conflict do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
