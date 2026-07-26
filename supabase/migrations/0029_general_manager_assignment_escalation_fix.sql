-- A General Manager must not add an assignment to an unrelated task merely by
-- choosing a profile in their own tree. The task itself must already be scoped
-- to that manager, or have been created by that manager.
create or replace function public.can_manage_task_assignment(subject_task uuid, target_profile uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_permission('tasks.assign') and (
    public.current_role()<>'general_manager'
    or (
      public.in_management_tree(target_profile)
      and exists(
        select 1 from public.tasks t
        where t.id=subject_task and (
          t.created_by=auth.uid()
          or exists(select 1 from public.task_assignments a where a.task_id=subject_task and public.in_management_tree(a.profile_id))
        )
      )
    )
  )
$$;

drop policy if exists "task assignments scoped manager inserts" on public.task_assignments;
create policy "task assignments scoped manager inserts" on public.task_assignments for insert to authenticated
with check (public.can_manage_task_assignment(task_id,profile_id));

drop policy if exists "task assignments scoped manager updates" on public.task_assignments;
create policy "task assignments scoped manager updates" on public.task_assignments for update to authenticated
using (public.can_manage_task_assignment(task_id,profile_id))
with check (public.can_manage_task_assignment(task_id,profile_id));

drop policy if exists "task assignments scoped manager delete" on public.task_assignments;
create policy "task assignments scoped manager delete" on public.task_assignments for delete to authenticated
using (public.can_manage_task_assignment(task_id,profile_id));
