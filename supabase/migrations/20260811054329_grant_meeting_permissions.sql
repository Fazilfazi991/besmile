-- Forward-only grants for the already deployed meetings permission catalogue.
do $$
declare
  management_codes text[] := array['meetings.view','meetings.create','meetings.manage'];
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select r.id, p.id
    from public.roles r join public.permissions p on p.code = any(management_codes)
    where r.code in ('chairman','director','general_manager')
    on conflict do nothing;

    insert into public.role_permissions(role_id, permission_id)
    select r.id, p.id
    from public.roles r join public.permissions p on p.code = 'meetings.view'
    where r.code = 'staff'
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role, permission_id)
    select v.role_name::public.employee_role, p.id
    from (values ('Chairman'),('Director'),('General Manager')) v(role_name)
    join public.permissions p on p.code = any(management_codes)
    on conflict do nothing;

    insert into public.role_permissions(role, permission_id)
    select 'Staff'::public.employee_role, p.id from public.permissions p where p.code='meetings.view'
    on conflict do nothing;
  end if;
end $$;
