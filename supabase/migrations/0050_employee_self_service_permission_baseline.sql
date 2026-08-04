-- Restore the approved employee self-service baseline in the legacy
-- role_permissions(role, permission_id) schema without broadening management
-- or security-administration privileges.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role, permission_id)
    select baseline.role_name::public.employee_role, permission.id
    from (values
      ('Psychologist', array['dashboard.view','attendance.self','leave.self','tasks.view_self','chat.use','notifications.view']::text[]),
      ('Intern', array['tasks.view_self','notifications.view']::text[]),
      ('Staff', array['dashboard.view','attendance.self','leave.self','tasks.view_self','documents.view','announcements.view','chat.use','notifications.view']::text[]),
      ('Chairman', array['chat.use']::text[]),
      ('Director', array['chat.use']::text[])
    ) as baseline(role_name, permission_codes)
    join public.permissions permission on permission.code = any(baseline.permission_codes)
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = any(case role.code
      when 'psychologist' then array['dashboard.view','attendance.self','leave.self','tasks.view_self','chat.use','notifications.view']
      when 'intern' then array['tasks.view_self','notifications.view']
      when 'staff' then array['dashboard.view','attendance.self','leave.self','tasks.view_self','documents.view','announcements.view','chat.use','notifications.view']
      when 'chairman' then array['chat.use']
      when 'director' then array['chat.use']
      else array[]::text[]
    end)
    where role.code in ('psychologist','intern','staff','chairman','director')
    on conflict do nothing;
  end if;
end $$;
