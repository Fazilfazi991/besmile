-- Reset all historical task-assignment policy variants. This avoids a legacy
-- permissive policy being OR-ed with the scoped policies during RLS evaluation.
drop policy if exists "task assignments read own or hierarchy" on public.task_assignments;
drop policy if exists "task assignments read own or authorized manager" on public.task_assignments;
drop policy if exists "task assignments read own or scoped manager" on public.task_assignments;
drop policy if exists "task assignments manager writes" on public.task_assignments;
drop policy if exists "task assignments manager update" on public.task_assignments;
drop policy if exists "task assignments authorized manager writes" on public.task_assignments;
drop policy if exists "task assignments authorized manager update" on public.task_assignments;
drop policy if exists "task assignments authorized manager delete" on public.task_assignments;
drop policy if exists "task assignments scoped manager inserts" on public.task_assignments;
drop policy if exists "task assignments scoped manager updates" on public.task_assignments;
drop policy if exists "task assignments scoped manager delete" on public.task_assignments;
drop policy if exists "task assignments employee status update" on public.task_assignments;

create policy "task assignments read own or scoped manager" on public.task_assignments for select to authenticated using (
  profile_id=auth.uid()
  or (
    public.has_permission('tasks.assign') and (
      public.current_role()<>'general_manager'
      or (public.task_visible_to_current_user(task_id) and public.in_management_tree(profile_id))
    )
  )
);

create policy "task assignments scoped manager inserts" on public.task_assignments for insert to authenticated
with check (public.can_manage_task_assignment(task_id,profile_id));

create policy "task assignments employee status update" on public.task_assignments for update to authenticated
using (profile_id=auth.uid())
with check (profile_id=auth.uid() and status in ('todo','in_progress','completed'));

create policy "task assignments scoped manager updates" on public.task_assignments for update to authenticated
using (public.can_manage_task_assignment(task_id,profile_id))
with check (public.can_manage_task_assignment(task_id,profile_id));

create policy "task assignments scoped manager delete" on public.task_assignments for delete to authenticated
using (public.can_manage_task_assignment(task_id,profile_id));
