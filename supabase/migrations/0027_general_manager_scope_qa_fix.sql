-- QA RLS correction: General Manager permissions are team-scoped, while
-- Chairman, Director, Super Admin and explicitly granted non-GM task managers
-- retain their existing authority.
create or replace function public.leave_employee_can_manage(requester uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select requester=auth.uid()
    or public.is_management()
    or (public.current_role()='general_manager' and public.in_management_tree(requester))
$$;

drop policy if exists "tasks visible to assignee or authorized manager" on public.tasks;
create policy "tasks visible to assignee or scoped manager" on public.tasks for select to authenticated using (
  exists(select 1 from public.task_assignments a where a.task_id=id and (
    a.profile_id=auth.uid()
    or (public.has_permission('tasks.assign') and (public.current_role()<>'general_manager' or public.in_management_tree(a.profile_id)))
  ))
);

drop policy if exists "task assignments read own or authorized manager" on public.task_assignments;
create policy "task assignments read own or scoped manager" on public.task_assignments for select to authenticated using (
  profile_id=auth.uid()
  or (public.has_permission('tasks.assign') and (public.current_role()<>'general_manager' or public.in_management_tree(profile_id)))
);

drop policy if exists "task assignments authorized manager writes" on public.task_assignments;
create policy "task assignments scoped manager inserts" on public.task_assignments for insert to authenticated with check (
  public.has_permission('tasks.assign') and (public.current_role()<>'general_manager' or public.in_management_tree(profile_id))
);

drop policy if exists "task assignments authorized manager update" on public.task_assignments;
create policy "task assignments scoped manager updates" on public.task_assignments for update to authenticated using (
  public.has_permission('tasks.assign') and (public.current_role()<>'general_manager' or public.in_management_tree(profile_id))
) with check (
  public.has_permission('tasks.assign') and (public.current_role()<>'general_manager' or public.in_management_tree(profile_id))
);

drop policy if exists "task assignments authorized manager delete" on public.task_assignments;
create policy "task assignments scoped manager delete" on public.task_assignments for delete to authenticated using (
  public.has_permission('tasks.assign') and (public.current_role()<>'general_manager' or public.in_management_tree(profile_id))
);
