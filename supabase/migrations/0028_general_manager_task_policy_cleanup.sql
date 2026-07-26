-- Replace the legacy FOR ALL task-manager policy, which also granted SELECT and
-- bypassed the tree-aware policies added in 0027.
create or replace function public.task_visible_to_current_user(subject_task uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.task_assignments a
    where a.task_id=subject_task and (
      a.profile_id=auth.uid()
      or (public.has_permission('tasks.assign') and (public.current_role()<>'general_manager' or public.in_management_tree(a.profile_id)))
    )
  )
$$;

drop policy if exists "tasks visible to assignee or scoped manager" on public.tasks;
drop policy if exists "tasks visible to assignee or authorized manager" on public.tasks;
drop policy if exists "tasks visible to assignee or management" on public.tasks;
create policy "tasks visible to scoped audience" on public.tasks for select to authenticated
using (public.task_visible_to_current_user(id));

drop policy if exists "tasks authorized managers write" on public.tasks;
drop policy if exists "tasks managers write" on public.tasks;
create policy "tasks scoped manager writes" on public.tasks for all to authenticated using (
  public.has_permission('tasks.assign') and (
    public.current_role()<>'general_manager'
    or created_by=auth.uid()
    or exists(select 1 from public.task_assignments a where a.task_id=id and public.in_management_tree(a.profile_id))
  )
) with check (
  public.has_permission('tasks.assign') and (
    public.current_role()<>'general_manager'
    or created_by=auth.uid()
    or exists(select 1 from public.task_assignments a where a.task_id=id and public.in_management_tree(a.profile_id))
  )
);
