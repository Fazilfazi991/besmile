-- Supersedes inherited Official Documents eligibility. Owner-approved current
-- population only: GM, Director, and Administration Assistant Manager (Diya).
-- Identity audit confirmed Diya and Assistant Manager are ONE active account.
begin;

insert into public.permissions(code, description)
values ('documents.mom.upload', 'Upload Minutes of Meeting with explicit owner approval')
on conflict (code) do update set description = excluded.description;

-- One-time direct grants, not role/bundle inheritance or a runtime designation
-- allowlist. Future users require a separately approved explicit grant.
insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile.id, permission.id, 'Owner-approved MOM upload population, 2026-09-23'
from public.profiles profile
cross join public.permissions permission
where permission.code = 'documents.mom.upload'
  and profile.status = 'active'
  -- Stable IDs from the read-only Production audit; migration data only, never
  -- runtime authorization rules. Absent IDs (QA) receive no automatic grants.
  and profile.id in (
    'e64c5750-b585-4cab-9478-2c1fbad3b26e'::uuid,
    '3f70fd80-bd37-4e89-b014-761bf563a219'::uuid,
    'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid
  )
  and not exists (
    select 1 from public.user_permission_grants existing
    where existing.profile_id = profile.id and existing.permission_id = permission.id
      and existing.revoked_at is null
      and (existing.expires_at is null or existing.expires_at > now())
  );

-- A narrowly scoped, current-user boolean lookup needs SECURITY DEFINER because
-- grant rows are security-admin-only. No subject argument, no data returned,
-- pinned search path, authenticated-only execution. Deliberately does not use
-- has_permission's implicit super-admin or role/bundle grants.
create or replace function public.official_mom_upload_allowed()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.user_permission_grants grant_row
    join public.permissions permission on permission.id = grant_row.permission_id
    join public.profiles profile on profile.id = grant_row.profile_id
    where profile.id = (select auth.uid()) and profile.status = 'active'
      and permission.code = 'documents.mom.upload'
      and grant_row.revoked_at is null and grant_row.starts_at <= now()
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  )
$$;
revoke all on function public.official_mom_upload_allowed() from public, anon;
grant execute on function public.official_mom_upload_allowed() to authenticated;

-- Existing manager INSERT policies otherwise permit every company subfolder.
-- Restrictive policies ensure those policies cannot bypass MOM authorization.
create policy "MOM file upload requires explicit permission"
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'employee-documents'
  or coalesce((storage.foldername(name))[1], '') <> 'company'
  or coalesce((storage.foldername(name))[3], '') <> 'mom'
  or (public.official_mom_upload_allowed() and public.official_mom_own_path(name))
);
create policy "MOM file replacement requires explicit permission"
on storage.objects as restrictive for update to authenticated
using (
  bucket_id <> 'employee-documents'
  or coalesce((storage.foldername(name))[1], '') <> 'company'
  or coalesce((storage.foldername(name))[3], '') <> 'mom'
  or public.official_mom_upload_allowed()
)
with check (
  bucket_id <> 'employee-documents'
  or coalesce((storage.foldername(name))[1], '') <> 'company'
  or coalesce((storage.foldername(name))[3], '') <> 'mom'
  or (public.official_mom_upload_allowed() and public.official_mom_own_path(name))
);

commit;
