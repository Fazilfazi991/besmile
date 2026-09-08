-- Task creation inserts the task first and returns its id before inserting the
-- selected assignees. The task SELECT policy previously exposed rows only
-- through task_assignments, so INSERT ... RETURNING could not see the new row.
-- Keep the existing audience rule and add only the still-authorized creator.

drop policy if exists "tasks visible to scoped audience" on public.tasks;
drop policy if exists "tasks visible to task audience" on public.tasks;

create policy "tasks visible to task audience" on public.tasks
for select
to authenticated
using (
  public.task_visible_to_current_user(id)
  or (
    created_by = (select auth.uid())
    and (
      public.has_permission('tasks.manage')
      or public.has_permission('tasks.assign')
    )
  )
);
