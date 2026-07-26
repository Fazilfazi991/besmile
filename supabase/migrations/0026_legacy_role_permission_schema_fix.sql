-- The connected project uses the legacy role_permissions(role, permission_id)
-- layout. Earlier ID-based seeds were intentionally skipped, leaving role grants
-- empty. Seed the same permissions against the live schema without changing it.
do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role,permission_id)
    select (case r.code
      when 'chairman' then 'Chairman'
      when 'director' then 'Director'
      else 'General Manager'
    end)::public.employee_role, p.id
    from public.roles r
    join public.permissions p on (
      (r.code in ('chairman','director') and p.code in (
        'admin.access','employees.view','employees.manage','attendance.view_team','attendance.manage','leave.review',
        'tasks.assign','tasks.manage_access','documents.manage','announcements.manage','notifications.view',
        'crm.manage_all','crm.import','finance.view','finance.manage','invoices.view','invoices.manage',
        'payroll.view','payroll.manage','reports.view','roles.manage','permissions.manage','audit.view','settings.manage'
      )) or
      (r.code='general_manager' and p.code in (
        'attendance.view_team','leave.review','tasks.assign','documents.manage','announcements.manage','crm.view_team','reports.view'
      ))
    )
    where r.code in ('chairman','director','general_manager')
    on conflict do nothing;
  end if;
end $$;
