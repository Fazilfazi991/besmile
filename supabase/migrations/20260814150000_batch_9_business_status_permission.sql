-- Batch 9 deliberately reuses canonical finance aggregates; this migration only
-- creates the management-only entry permission for the read-only workspace.
insert into public.permissions(code,description) values ('business_status.view','View Accounts & Business Status') on conflict(code) do update set description=excluded.description;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r join public.permissions p on p.code='business_status.view' where r.code in ('chairman','director','general_manager') on conflict do nothing;
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role,permission_id) select r::public.employee_role,p.id from unnest(array['Chairman','Director','General Manager']) r join public.permissions p on p.code='business_status.view' on conflict do nothing;
  end if;
end $$;
