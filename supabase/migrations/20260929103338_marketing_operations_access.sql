-- Grant the approved operational scope to the two verified internal profiles.
-- Account-specific grants avoid broadening every Marketing employee or every
-- Sales Coordinator. Daily-work review is deliberately department-scoped and
-- does not imply attendance administration.
--
-- Manual rollback: revoke the grants carrying the reason below, then restore
-- the prior daily-work SELECT policy and drop the dedicated review permission
-- and can_review_daily_work function.

do $$
declare
  verified_profiles integer;
begin
  select count(*) into verified_profiles
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  join public.departments department on department.id = profile.department_id
  where profile.status = 'active'
    and profile.login_enabled
    and profile.is_employee
    and profile.workforce_visible
    and auth_user.deleted_at is null
    and (
      (lower(profile.email) = 'bdmbsmile@gmail.com'
        and lower(auth_user.email) = 'bdmbsmile@gmail.com'
        and department.name = 'Marketing'
        and profile.designation = 'Marketing Manager')
      or
      (lower(profile.email) = 'salescobsmile@gmail.com'
        and lower(auth_user.email) = 'salescobsmile@gmail.com'
        and department.name = 'Marketing'
        and profile.designation = 'Marketing Coordinator')
    );

  if verified_profiles <> 2 then
    raise exception
      'Expected exactly two verified active Marketing operations profiles, found %',
      verified_profiles;
  end if;
end
$$;

insert into public.permissions(code, description)
values (
  'daily_work.review_department',
  'Review Daily Work Updates for active internal employees in the same department'
)
on conflict(code) do update set description = excluded.description;

with target_profiles as (
  select profile.id
  from public.profiles profile
  join public.departments department on department.id = profile.department_id
  where profile.status = 'active'
    and profile.login_enabled
    and profile.is_employee
    and profile.workforce_visible
    and department.name = 'Marketing'
    and (
      (lower(profile.email) = 'bdmbsmile@gmail.com' and profile.designation = 'Marketing Manager')
      or
      (lower(profile.email) = 'salescobsmile@gmail.com' and profile.designation = 'Marketing Coordinator')
    )
), approved_permissions(code) as (
  values
    ('attendance.self'),
    ('crm.import'),
    ('crm.manage_all'),
    ('daily_work.review_department'),
    ('dashboard.view'),
    ('leads.convert_to_patient'),
    ('leads.create'),
    ('leads.edit'),
    ('patients.create'),
    ('patients.view_identity'),
    ('sales.edit')
), grants as (
  select target.id as profile_id, permission.id as permission_id
  from target_profiles target
  cross join approved_permissions approved
  join public.permissions permission on permission.code = approved.code
)
insert into public.user_permission_grants(profile_id, permission_id, reason)
select profile_id, permission_id, 'Approved Marketing operations access'
from grants proposed
where not exists (
  select 1
  from public.user_permission_grants existing
  where existing.profile_id = proposed.profile_id
    and existing.permission_id = proposed.permission_id
    and existing.revoked_at is null
    and existing.starts_at <= now()
    and (existing.expires_at is null or existing.expires_at > now())
);

do $$
declare
  profile_record record;
  permission_count integer;
begin
  for profile_record in
    select id, employee_code
    from public.profiles
    where lower(email) in ('bdmbsmile@gmail.com', 'salescobsmile@gmail.com')
  loop
    select count(*) into permission_count
    from public.user_permission_grants grant_record
    join public.permissions permission on permission.id = grant_record.permission_id
    where grant_record.profile_id = profile_record.id
      and grant_record.revoked_at is null
      and grant_record.starts_at <= now()
      and (grant_record.expires_at is null or grant_record.expires_at > now())
      and permission.code = any(array[
        'attendance.self',
        'crm.import',
        'crm.manage_all',
        'daily_work.review_department',
        'dashboard.view',
        'leads.convert_to_patient',
        'leads.create',
        'leads.edit',
        'patients.create',
        'patients.view_identity',
        'sales.edit'
      ]);

    if permission_count <> 11 then
      raise exception
        'Marketing operations profile % expected 11 approved grants, found %',
        profile_record.employee_code,
        permission_count;
    end if;
  end loop;
end
$$;

create or replace function public.can_review_daily_work(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id = (select auth.uid())
    or public.has_permission('attendance.manage')
    or (
      public.has_permission('attendance.view')
      and public.in_management_tree(target_profile_id)
    )
    or (
      public.has_permission('daily_work.review_department')
      and exists (
        select 1
        from public.profiles viewer
        join public.profiles subject
          on subject.id = target_profile_id
         and subject.department_id = viewer.department_id
        where viewer.id = (select auth.uid())
          and viewer.status = 'active'
          and viewer.login_enabled
          and viewer.is_employee
          and viewer.workforce_visible
          and subject.status = 'active'
          and subject.login_enabled
          and subject.is_employee
          and subject.workforce_visible
      )
    )
$$;

revoke all on function public.can_review_daily_work(uuid) from public, anon;
grant execute on function public.can_review_daily_work(uuid) to authenticated;

drop policy if exists "daily work updates readable by owner or workforce managers"
on public.daily_work_updates;
create policy "daily work updates readable by owner or workforce managers"
on public.daily_work_updates for select to authenticated
using (public.can_review_daily_work(profile_id));

notify pgrst, 'reload schema';
