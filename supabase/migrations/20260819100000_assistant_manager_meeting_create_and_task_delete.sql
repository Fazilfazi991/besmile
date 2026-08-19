-- Production uses tasks.assign as the canonical task-management capability.
-- Assistant Managers already receive task access through that existing grant;
-- this migration adds only their missing, scoped meeting-creation capability.
insert into public.user_permission_grants(profile_id, permission_id, granted_by, reason)
select
  assistant.id,
  permission.id,
  coalesce(
    (select manager.id from public.profiles manager where manager.role::text in ('general_manager', 'General Manager') order by manager.created_at limit 1),
    assistant.id
  ),
  'Assistant Manager meeting creation'
from public.profiles assistant
join public.permissions permission on permission.code = 'meetings.create'
where assistant.is_employee = true
  and assistant.status::text in ('active', 'intern', 'probation')
  and assistant.designation = 'Assistant Manager'
  and not exists (
    select 1
    from public.user_permission_grants permission_grant
    where permission_grant.profile_id = assistant.id
      and permission_grant.permission_id = permission.id
      and permission_grant.revoked_at is null
  );

-- The legacy policy is FOR ALL and therefore also grants direct DELETE to
-- tasks.assign users. Preserve its insert/update scope but make deletion RPC
-- only, so browser clients cannot bypass the audited authorization path.
drop policy if exists "tasks scoped manager writes" on public.tasks;
create policy "tasks scoped manager inserts" on public.tasks for insert to authenticated
with check (
  public.has_permission('tasks.assign') and (
    public.current_role() <> 'general_manager'
    or created_by = auth.uid()
    or exists (
      select 1
      from public.task_assignments assignment
      where assignment.task_id = tasks.id
        and public.in_management_tree(assignment.profile_id)
    )
  )
);
create policy "tasks scoped manager updates" on public.tasks for update to authenticated
using (
  public.has_permission('tasks.assign') and (
    public.current_role() <> 'general_manager'
    or created_by = auth.uid()
    or exists (
      select 1
      from public.task_assignments assignment
      where assignment.task_id = tasks.id
        and public.in_management_tree(assignment.profile_id)
    )
  )
)
with check (
  public.has_permission('tasks.assign') and (
    public.current_role() <> 'general_manager'
    or created_by = auth.uid()
    or exists (
      select 1
      from public.task_assignments assignment
      where assignment.task_id = tasks.id
        and public.in_management_tree(assignment.profile_id)
    )
  )
);

create or replace function public.delete_managed_task(target_task uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.has_permission('tasks.assign')
    or not public.task_visible_to_current_user(target_task) then
    raise exception 'Permission denied for task deletion' using errcode = '42501';
  end if;

  if not exists (select 1 from public.tasks where id = target_task) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  select auth.uid(), 'task_deleted', 'tasks', task.id, to_jsonb(task), null
  from public.tasks task
  where task.id = target_task;

  delete from public.tasks where id = target_task;
  return target_task;
end;
$$;

revoke all on function public.delete_managed_task(uuid) from public, anon;
grant execute on function public.delete_managed_task(uuid) to authenticated;
