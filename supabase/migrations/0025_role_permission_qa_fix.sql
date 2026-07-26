-- QA correction: management roles need the finance permissions expected by the
-- admin workspace. Super Admin remains an automatic override in has_permission.
do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id)
    select r.id,p.id
    from public.roles r
    join public.permissions p on p.code in (
      'finance.view','finance.manage','invoices.view','invoices.manage',
      'payroll.view','payroll.manage','reports.view'
    )
    where r.code in ('chairman','director')
    on conflict do nothing;

    insert into public.role_permissions(role_id,permission_id)
    select r.id,p.id
    from public.roles r
    join public.permissions p on p.code in ('finance.view','payroll.view','invoices.view','reports.view')
    where r.code='general_manager'
    on conflict do nothing;
  end if;
end $$;
