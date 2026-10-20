-- Forward-only repair: operational internal employees retain owner-only writes.
-- Review branches, department and management-tree scope are preserved.
begin;
create or replace function public.can_review_daily_work(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.status in ('active', 'intern', 'probation')
      and viewer.removed_at is null
      and viewer.login_enabled
      and viewer.is_employee
      and viewer.workforce_visible
      and not coalesce(viewer.onboarding_required, false)
  ) and (
    target_profile_id = (select auth.uid())
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
          and viewer.status in ('active', 'intern', 'probation')
          and viewer.removed_at is null
      and viewer.login_enabled
          and viewer.is_employee
          and viewer.workforce_visible
          and subject.status in ('active', 'intern', 'probation')
          and subject.removed_at is null
      and subject.login_enabled
          and subject.is_employee
          and subject.workforce_visible
          and not coalesce(subject.onboarding_required, false)
      )
    )
  )
$$;

revoke all on function public.can_review_daily_work(uuid) from public, anon;
grant execute on function public.can_review_daily_work(uuid) to authenticated;

drop policy if exists "daily work updates created by owner"
on public.daily_work_updates;
create policy "daily work updates created by owner"
on public.daily_work_updates for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles owner_profile
    where owner_profile.id = (select auth.uid())
      and owner_profile.status in ('active', 'intern', 'probation')
      and owner_profile.removed_at is null
      and owner_profile.login_enabled
      and owner_profile.is_employee
      and owner_profile.workforce_visible
      and not coalesce(owner_profile.onboarding_required, false)
  )
);

drop policy if exists "daily work updates edited by owner"
on public.daily_work_updates;
create policy "daily work updates edited by owner"
on public.daily_work_updates for update to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles owner_profile
    where owner_profile.id = (select auth.uid())
      and owner_profile.status in ('active', 'intern', 'probation')
      and owner_profile.removed_at is null
      and owner_profile.login_enabled
      and owner_profile.is_employee
      and owner_profile.workforce_visible
      and not coalesce(owner_profile.onboarding_required, false)
  )
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles owner_profile
    where owner_profile.id = (select auth.uid())
      and owner_profile.status in ('active', 'intern', 'probation')
      and owner_profile.removed_at is null
      and owner_profile.login_enabled
      and owner_profile.is_employee
      and owner_profile.workforce_visible
      and not coalesce(owner_profile.onboarding_required, false)
  )
);


commit;
