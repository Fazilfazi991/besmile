-- Diya's approved meeting-host access is a scoped direct grant, not a role change.
insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile.id, permission.id, 'Approved meeting host access'
from public.profiles profile
join public.permissions permission on permission.code = 'meetings.create'
where lower(profile.email) = 'diyaassistantmanager@gmail.com'
  and profile.status = 'active'
  and not exists (
    select 1
    from public.user_permission_grants grant_row
    where grant_row.profile_id = profile.id
      and grant_row.permission_id = permission.id
      and grant_row.revoked_at is null
      and grant_row.starts_at <= now()
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  );
