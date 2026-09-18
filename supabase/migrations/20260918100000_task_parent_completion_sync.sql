-- Keep parent task status canonical when staff completes assignments.
-- This migration is compatible with Production's legacy tasks schema: some
-- environments do not have completed_at/completed_by yet.

create or replace function public.complete_task_assignment(target_assignment uuid, completion_update text)
returns public.task_assignments
language plpgsql
security definer
set search_path = public
as $fn$
declare
  assignment public.task_assignments;
  message text := trim(coalesce(completion_update, ''));
  has_completion_metadata boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(message) < 1 or char_length(message) > 2000 then
    raise exception 'Completion update must be between 1 and 2,000 characters' using errcode = '22023';
  end if;

  select * into assignment from public.task_assignments where id = target_assignment for update;
  if assignment.id is null or assignment.profile_id <> auth.uid() then
    raise exception 'Task assignment is unavailable' using errcode = '42501';
  end if;
  if assignment.status <> 'in_progress' then
    raise exception 'Only an in-progress task can be completed' using errcode = '22023';
  end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'Only active employees can complete tasks' using errcode = '42501';
  end if;

  insert into public.task_comments(task_id, author_id, body)
  values (assignment.task_id, auth.uid(), message);
  update public.task_assignments
  set status = 'completed', updated_at = now()
  where id = assignment.id
  returning * into assignment;

  -- Multi-assignee semantics: only the final completed assignment closes the
  -- parent task. Do not use a client-side counter as a substitute.
  if not exists (
    select 1 from public.task_assignments
    where task_id = assignment.task_id and status <> 'completed'
  ) then
    select count(*) = 2 from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks'
        and column_name in ('completed_at', 'completed_by')
    into has_completion_metadata;
    if has_completion_metadata then
      execute 'update public.tasks
               set status = ''completed'',
                   completed_at = coalesce(completed_at, now()),
                   completed_by = coalesce(completed_by, $1)
               where id = $2'
        using auth.uid(), assignment.task_id;
    else
      update public.tasks set status = 'completed' where id = assignment.task_id;
    end if;
  end if;
  return assignment;
end;
$fn$;

create or replace function public.complete_managed_task(target_task uuid, completion_update text)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $fn$
declare
  task public.tasks;
  message text := trim(coalesce(completion_update, ''));
  has_completion_metadata boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(message) < 1 or char_length(message) > 2000 then
    raise exception 'Completion update must be between 1 and 2,000 characters' using errcode = '22023';
  end if;
  if not (public.has_permission('tasks.manage') or public.has_permission('tasks.assign')) then
    raise exception 'Task management permission required' using errcode = '42501';
  end if;
  select * into task from public.tasks where id = target_task for update;
  if task.id is null or not public.task_visible_to_current_user(task.id) then
    raise exception 'Task is unavailable' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.task_assignments assignment
    where assignment.task_id = task.id
      and not public.can_manage_task_assignment(task.id, assignment.profile_id)
  ) then raise exception 'Task is outside your permitted scope' using errcode = '42501'; end if;

  insert into public.task_comments(task_id, author_id, body)
  values (task.id, auth.uid(), message);
  update public.task_assignments set status = 'completed', updated_at = now() where task_id = task.id;
  select count(*) = 2 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks'
      and column_name in ('completed_at', 'completed_by')
  into has_completion_metadata;
  if has_completion_metadata then
    execute 'update public.tasks
             set status = ''completed'',
                 completed_at = coalesce(completed_at, now()),
                 completed_by = coalesce(completed_by, $1)
             where id = $2'
      using auth.uid(), task.id;
  else
    update public.tasks set status = 'completed' where id = task.id;
  end if;
  select * into task from public.tasks where id = target_task;
  return task;
end;
$fn$;

-- Reconcile only parents whose existing assignments are all completed. This
-- intentionally does not alter assignments or task history/comments.
update public.tasks t
set status = 'completed'
where t.status <> 'completed'
  and exists (select 1 from public.task_assignments a where a.task_id = t.id)
  and not exists (
    select 1 from public.task_assignments a
    where a.task_id = t.id and a.status <> 'completed'
  );

revoke all on function public.complete_task_assignment(uuid, text) from public, anon;
revoke all on function public.complete_managed_task(uuid, text) from public, anon;
grant execute on function public.complete_task_assignment(uuid, text) to authenticated;
grant execute on function public.complete_managed_task(uuid, text) to authenticated;
