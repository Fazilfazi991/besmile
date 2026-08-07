-- Enforce the employee/clinician boundary at the database layer.

create or replace function public.profile_is_employee(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select profile.is_employee from public.profiles profile where profile.id = target_profile), false)
$$;
revoke execute on function public.profile_is_employee(uuid) from public, anon;
grant execute on function public.profile_is_employee(uuid) to authenticated, service_role;

drop policy if exists "attendance self team or manager read" on public.attendance;
drop policy if exists "attendance self team or manager write" on public.attendance;
create policy "attendance self team or manager read" on public.attendance for select to authenticated using (
  public.profile_is_employee(profile_id)
  and (
    profile_id = (select auth.uid())
    or public.has_permission('attendance.view')
    or public.has_permission('attendance.manage')
    or (public.has_permission('attendance.view_team') and public.in_management_tree(profile_id))
  )
);
create policy "attendance self team or manager write" on public.attendance for all to authenticated using (
  public.profile_is_employee(profile_id)
  and (
    profile_id = (select auth.uid())
    or public.has_permission('attendance.manage')
    or (public.has_permission('attendance.view_team') and public.in_management_tree(profile_id))
  )
) with check (
  public.profile_is_employee(profile_id)
  and (
    profile_id = (select auth.uid())
    or public.has_permission('attendance.manage')
    or (public.has_permission('attendance.view_team') and public.in_management_tree(profile_id))
  )
);

create or replace function public.leave_employee_can_manage(requester uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.profile_is_employee(requester)
    and (
      requester = (select auth.uid())
      or public.has_permission('leave.view')
      or public.has_permission('leave.review')
      or public.has_permission('leave.approve')
      or (public.current_role() = 'general_manager' and public.in_management_tree(requester))
    )
$$;

drop policy if exists "leave create own" on public.leave_requests;
create policy "leave create own" on public.leave_requests for insert to authenticated with check (
  profile_id = (select auth.uid())
  and public.profile_is_employee(profile_id)
  and status = 'pending'
  and approver_id is null
);
drop policy if exists "leave employee eligible updates" on public.leave_requests;
create policy "leave employee eligible updates" on public.leave_requests for update to authenticated
using (profile_id = (select auth.uid()) and public.profile_is_employee(profile_id) and status in ('pending','approved'))
with check (profile_id = (select auth.uid()) and public.profile_is_employee(profile_id) and status in ('cancelled','withdrawn'));

drop policy if exists "leave balances management writes" on public.employee_leave_balances;
create policy "leave balances management writes" on public.employee_leave_balances for all to authenticated
using (public.profile_is_employee(profile_id) and (public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id))))
with check (public.profile_is_employee(profile_id) and (public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id))));

drop policy if exists "salary settings access" on public.employee_salary_settings;
create policy "salary settings access" on public.employee_salary_settings for all to authenticated
using (public.profile_is_employee(profile_id) and (public.has_permission('payroll.view') or public.has_permission('payroll.manage')))
with check (public.profile_is_employee(profile_id) and public.has_permission('payroll.manage'));

drop policy if exists "payroll entries access" on public.payroll_entries;
create policy "payroll entries access" on public.payroll_entries for all to authenticated
using (public.profile_is_employee(profile_id) and (public.has_permission('payroll.view') or public.has_permission('payroll.manage')))
with check (public.profile_is_employee(profile_id) and public.has_permission('payroll.manage'));

notify pgrst, 'reload schema';
