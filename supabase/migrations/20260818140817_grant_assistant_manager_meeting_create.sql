-- The approved Assistant Manager keeps the Staff role and receives only the
-- scoped creation capability. Existing organizer rules then permit her to
-- edit/cancel meetings she creates; this does not grant arbitrary management.
insert into public.user_permission_grants(profile_id, permission_id, granted_by, reason)
select
  assistant_manager.id,
  permission.id,
  general_manager.id,
  'Approved Assistant Manager meeting creation'
from public.profiles assistant_manager
join public.profiles general_manager on general_manager.id = 'e64c5750-b585-4cab-9478-2c1fbad3b26e'
join public.permissions permission on permission.code = 'meetings.create'
where assistant_manager.id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'
  and assistant_manager.is_employee = true
  and assistant_manager.status::text in ('active', 'intern', 'probation')
  and assistant_manager.designation = 'Assistant Manager'
  and not exists (
    select 1
    from public.user_permission_grants existing
    where existing.profile_id = assistant_manager.id
      and existing.permission_id = permission.id
      and existing.revoked_at is null
  );
