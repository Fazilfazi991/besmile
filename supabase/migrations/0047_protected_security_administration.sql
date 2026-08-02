-- Security administration is exclusive to the actual super_admin role. General
-- Manager retains operational permissions but cannot edit roles, permissions,
-- direct grants, or security audit data.
do $$
declare security_permissions text[] := array[
  'roles.view','roles.manage','permissions.view','permissions.manage',
  'tasks.manage_access','company_settings.manage','audit.view','settings.manage',
  'system.override','protected_roles.manage','access_grants.view','access_grants.manage','security_audit.view'
];
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    delete from public.role_permissions rp
    using public.permissions permission
    where rp.permission_id=permission.id
      and rp.role::text='General Manager'
      and permission.code=any(security_permissions);
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    delete from public.role_permissions rp
    using public.roles role, public.permissions permission
    where rp.role_id=role.id and rp.permission_id=permission.id
      and role.code='general_manager'
      and permission.code=any(security_permissions);
  end if;

  -- Revoke any active, unintended direct security grant while retaining an
  -- auditable revoked record rather than deleting the grant history.
  update public.user_permission_grants grant_row
  set revoked_at=coalesce(grant_row.revoked_at, now()),
      revoked_by=null,
      updated_at=now()
  from public.profiles profile, public.permissions permission
  where grant_row.profile_id=profile.id and grant_row.permission_id=permission.id
    and profile.email ilike 'bsmile.gm@gmail.com'
    and permission.code=any(security_permissions)
    and grant_row.revoked_at is null;
end $$;

create or replace function public.can_manage_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin()
$$;

do $$
declare policy_row record;
begin
  for policy_row in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('roles','permissions','role_permissions','audit_logs','user_permission_grants')
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end $$;

create policy "security roles super admin only" on public.roles for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
create policy "security permissions super admin only" on public.permissions for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
create policy "security role permissions super admin only" on public.role_permissions for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
create policy "security audit super admin only" on public.audit_logs for select to authenticated using(public.is_super_admin());
create policy "security direct grants super admin only" on public.user_permission_grants for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
