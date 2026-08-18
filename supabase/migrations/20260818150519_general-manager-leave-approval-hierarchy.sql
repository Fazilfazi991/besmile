-- General Managers remain employees who can request their own leave, but their
-- requests must be reviewed by an active Chairman or Director.  Keep the
-- existing staff hierarchy untouched for every other requester.

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
      or case
      when exists (
        select 1
        from public.profiles requested_profile
        where requested_profile.id = requester
          and requested_profile.role = 'general_manager'
      ) then exists (
        select 1
        from public.profiles reviewer_profile
        where reviewer_profile.id = (select auth.uid())
          and reviewer_profile.role in ('chairman', 'director')
          and reviewer_profile.status = 'active'
          and reviewer_profile.workforce_visible
      )
      else public.has_permission('leave.view')
        or public.has_permission('leave.review')
        or public.has_permission('leave.approve')
        or (
          public.current_role() = 'general_manager'
          and public.in_management_tree(requester)
        )
      end
    )
$$;

create or replace function public.leave_review_authorized(requester uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and requester is distinct from (select auth.uid())
    and public.leave_employee_can_manage(requester)
$$;

revoke all on function public.leave_employee_can_manage(uuid) from public, anon;
grant execute on function public.leave_employee_can_manage(uuid) to authenticated, service_role;
revoke all on function public.leave_review_authorized(uuid) from public, anon;
grant execute on function public.leave_review_authorized(uuid) to authenticated, service_role;

-- Direct Data API updates cannot bypass the canonical review rule.  Employee
-- cancellation remains governed by the existing own-request policy.
drop policy if exists "leave management updates" on public.leave_requests;
create policy "leave management updates"
on public.leave_requests for update to authenticated
using (
  status = 'pending'
  and public.leave_review_authorized(profile_id)
)
with check (
  status in ('approved', 'rejected')
  and approver_id = (select auth.uid())
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
  and public.leave_review_authorized(profile_id)
);

create or replace function public.review_leave_request(
  target_request uuid,
  decision text,
  review_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  leave_request public.leave_requests%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Leave decision must be approved or rejected.' using errcode = '22023';
  end if;

  select * into leave_request
  from public.leave_requests
  where id = target_request
  for update;

  if not found then
    raise exception 'Leave request not found.' using errcode = 'P0002';
  end if;

  if leave_request.status <> 'pending' then
    raise exception 'This leave request has already been reviewed.' using errcode = 'P0001';
  end if;

  if not public.leave_review_authorized(leave_request.profile_id) then
    raise exception 'You are not authorized to review this leave request.' using errcode = '42501';
  end if;

  update public.leave_requests
  set status = decision,
      approval_comment = nullif(trim(review_comment), ''),
      approver_id = (select auth.uid()),
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = leave_request.id;

  insert into public.leave_approval_events(leave_request_id, actor_id, event_type, comment)
  values (leave_request.id, (select auth.uid()), decision, nullif(trim(review_comment), ''));

  return leave_request.id;
end
$$;

revoke all on function public.review_leave_request(uuid, text, text) from public, anon;
grant execute on function public.review_leave_request(uuid, text, text) to authenticated, service_role;

-- GM requests alert only their eligible executive approvers.  Other requests
-- retain the existing notification recipients and status notifications.
create or replace function public.notify_leave_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  manager record;
  requester_is_general_manager boolean;
begin
  if TG_OP = 'INSERT' then
    select role = 'general_manager'
    into requester_is_general_manager
    from public.profiles
    where id = new.profile_id;

    for manager in
      select id
      from public.profiles
      where status = 'active'
        and workforce_visible
        and (
          (requester_is_general_manager and role in ('chairman', 'director'))
          or (not requester_is_general_manager and role in ('super_admin', 'chairman', 'director', 'general_manager'))
        )
    loop
      perform public.notify_user(
        manager.id,
        'New leave request',
        'An employee submitted a leave request.',
        'leave_submitted',
        new.id,
        '/admin/leaves?request=' || new.id::text,
        new.profile_id,
        'leave',
        'high',
        'standard',
        true,
        jsonb_build_object('entity_type', 'leave_request', 'destination_url', '/admin/leaves?request=' || new.id::text)
      );
    end loop;
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.notify_user(
      new.profile_id,
      'Leave request ' || new.status,
      'Your leave request was ' || new.status || '.',
      'leave_' || new.status,
      new.id,
      case when exists (select 1 from public.profiles where id = new.profile_id and role = 'general_manager')
        then '/admin/my-leave?request=' || new.id::text
        else '/employee/leaves?request=' || new.id::text
      end,
      coalesce(new.reviewed_by, new.approver_id),
      'leave',
      'high',
      case when new.status = 'approved' then 'success' else 'warning' end,
      true,
      jsonb_build_object(
        'entity_type', 'leave_request',
        'destination_url', case when exists (select 1 from public.profiles where id = new.profile_id and role = 'general_manager')
          then '/admin/my-leave?request=' || new.id::text
          else '/employee/leaves?request=' || new.id::text
        end
      )
    );
  end if;
  return new;
end
$$;

revoke all on function public.notify_leave_event() from public, anon, authenticated;
notify pgrst, 'reload schema';
