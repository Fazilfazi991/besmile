-- Batch 7 follow-up: replace the historical named-person exception with the
-- canonical role-and-effective-permission model.  This is intentionally
-- forward-only; the original migration remains an immutable deployment record.

update public.user_permission_grants grant_row
set revoked_at = coalesce(grant_row.revoked_at, now())
from public.permissions permission
where grant_row.profile_id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid
  and grant_row.permission_id = permission.id
  and permission.code in ('meetings.view', 'meetings.create', 'meetings.host', 'meetings.notes')
  and grant_row.revoked_at is null;

create or replace function public.meeting_host_allowed(candidate uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.profiles profile
    where profile.id = candidate
      and profile.status = 'active'
      and profile.is_employee
      and profile.workforce_visible
      and public.has_permission('meetings.host', profile.id)
      and profile.role::text in ('director', 'general_manager')
  )
$$;
