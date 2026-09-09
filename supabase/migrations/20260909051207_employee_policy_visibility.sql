-- Give employee-facing roles discoverability for the existing shared Documents
-- area. Row visibility remains controlled by document_shares RLS, so unshared
-- and management-only records remain protected.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role, permission_id)
    select role_name::public.employee_role, permission.id
    from unnest(array['Psychologist', 'Intern', 'Staff']) role_name
    join public.permissions permission on permission.code = 'documents.view'
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'documents.view'
    where role.code in ('psychologist', 'intern', 'staff')
    on conflict do nothing;
  end if;
end $$;
