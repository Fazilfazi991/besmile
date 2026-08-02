-- Security-administration permissions must never be inherited by operational
-- management roles. The legacy schema stores display labels in role_permissions,
-- so normalize those labels before revoking the protected capabilities.
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
    where rp.permission_id = permission.id
      and trim(both '_' from regexp_replace(lower(rp.role::text), '[^a-z0-9]+', '_', 'g')) in ('chairman', 'director', 'general_manager')
      and permission.code = any(security_permissions);
  elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    delete from public.role_permissions rp
    using public.roles role, public.permissions permission
    where rp.role_id = role.id
      and rp.permission_id = permission.id
      and role.code in ('chairman', 'director', 'general_manager')
      and permission.code = any(security_permissions);
  end if;

  update public.user_permission_grants grant_row
  set revoked_at = coalesce(grant_row.revoked_at, now()),
      revoked_by = null,
      updated_at = now()
  from public.profiles profile, public.permissions permission
  where grant_row.profile_id = profile.id
    and grant_row.permission_id = permission.id
    and trim(both '_' from regexp_replace(lower(profile.role::text), '[^a-z0-9]+', '_', 'g')) <> 'super_admin'
    and permission.code = any(security_permissions)
    and grant_row.revoked_at is null;
end $$;
