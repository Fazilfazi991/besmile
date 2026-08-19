-- Assistant Managers need the established CRM management boundary, without a role change.
-- crm.manage_all is the canonical production capability for all-lead visibility and
-- management; admin.shell permits the existing /admin/crm management workspace.
insert into public.user_permission_grants (profile_id, permission_id, granted_by, reason)
select
  assistant.id,
  permission.id,
  coalesce(
    (
      select manager.id
      from public.profiles manager
      where manager.role::text in ('general_manager', 'General Manager')
      order by manager.created_at
      limit 1
    ),
    assistant.id
  ),
  'Assistant Manager CRM management access'
from public.profiles assistant
join public.permissions permission on permission.code in ('admin.shell', 'crm.manage_all')
where assistant.is_employee = true
  and assistant.status::text in ('active', 'intern', 'probation')
  and assistant.role::text = 'staff'
  and assistant.designation = 'Assistant Manager'
  and not exists (
    select 1
    from public.user_permission_grants permission_grant
    where permission_grant.profile_id = assistant.id
      and permission_grant.permission_id = permission.id
      and permission_grant.revoked_at is null
  );
