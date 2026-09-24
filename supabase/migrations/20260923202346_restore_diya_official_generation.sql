-- Restore the approved generator capability to Diya's active Production account.
-- The E5 migration attached it to the Administration / Assistant Manager bundle,
-- but her canonical profile is Administration / Admin. A direct grant avoids
-- broadening either designation to other users.
begin;

do $$
begin
  if not exists (
    select 1 from public.profiles profile
    join public.departments department on department.id = profile.department_id
    where profile.id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid
      and profile.full_name = 'Diya Anthikat'
      and profile.role = 'staff'
      and profile.status = 'active'
      and btrim(profile.designation) = 'Admin'
      and department.name = 'Administration'
  ) then
    raise exception 'Diya official generation identity check failed; stop release';
  end if;
end
$$;

insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile.id, permission.id, 'Restore owner-approved official document generation for Diya'
from public.profiles profile
join public.permissions permission on permission.code = 'documents.official.generate'
where profile.id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid
  and not exists (
    select 1 from public.user_permission_grants existing
    where existing.profile_id = profile.id
      and existing.permission_id = permission.id
      and existing.revoked_at is null
      and existing.starts_at <= now()
      and (existing.expires_at is null or existing.expires_at > now())
  );

commit;
