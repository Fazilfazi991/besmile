-- Reassignment needs managers with tasks.assign to remove an obsolete assignment.
drop policy if exists "task assignments authorized manager delete" on public.task_assignments;
create policy "task assignments authorized manager delete" on public.task_assignments for delete to authenticated using(public.has_permission('tasks.assign'));
