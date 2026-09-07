-- Narrow clinician availability management: no clinician profile or lifecycle access.
insert into public.permissions(code, description)
values ('clinician.availability.manage_all', 'Manage availability for all active clinicians')
on conflict (code) do update set description = excluded.description;

create or replace function public.can_manage_clinician(target_doctor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('doctor_scheduling.manage_doctors')
    or public.has_permission('clinician.availability.manage_all')
    or target_doctor = public.current_clinician_id()
$$;

revoke all on function public.can_manage_clinician(uuid) from public, anon;
grant execute on function public.can_manage_clinician(uuid) to authenticated, service_role;

insert into public.user_permission_grants(profile_id, permission_id, granted_by, reason)
select profile.id, permission.id, profile.id, 'Global clinician availability management'
from public.profiles profile
join public.permissions permission on permission.code = 'clinician.availability.manage_all'
where ((
  profile.is_employee = true
  and profile.status::text in ('active', 'intern', 'probation')
  and profile.role::text = 'staff'
  and profile.designation = 'Assistant Manager'
) or (
  profile.full_name = 'Aiswarya P'
  and profile.designation = 'Psychologist'
  and profile.status::text in ('active', 'intern', 'probation')
))
and not exists (
  select 1 from public.user_permission_grants grant_row
  where grant_row.profile_id = profile.id
    and grant_row.permission_id = permission.id
    and grant_row.revoked_at is null
);

notify pgrst, 'reload schema';
