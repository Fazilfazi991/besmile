-- Store the required completion update and status transition in one transaction.
create or replace function public.complete_task_assignment(target_assignment uuid, completion_update text)
returns public.task_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment public.task_assignments;
  message text := trim(coalesce(completion_update, ''));
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

  insert into public.task_comments(task_id, author_id, body) values (assignment.task_id, auth.uid(), message);
  update public.task_assignments set status = 'completed', updated_at = now() where id = assignment.id returning * into assignment;
  return assignment;
end
$$;

create or replace function public.complete_managed_task(target_task uuid, completion_update text)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  task public.tasks;
  message text := trim(coalesce(completion_update, ''));
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
  if exists(
    select 1 from public.task_assignments assignment
    where assignment.task_id = task.id
      and not public.can_manage_task_assignment(task.id, assignment.profile_id)
  ) then
    raise exception 'Task is outside your permitted scope' using errcode = '42501';
  end if;

  insert into public.task_comments(task_id, author_id, body) values (task.id, auth.uid(), message);
  update public.task_assignments set status = 'completed', updated_at = now() where task_id = task.id;
  update public.tasks set status = 'completed', completed_at = coalesce(completed_at, now()), completed_by = auth.uid() where id = task.id returning * into task;
  return task;
end
$$;

revoke all on function public.complete_task_assignment(uuid, text) from public;
revoke all on function public.complete_managed_task(uuid, text) from public;
grant execute on function public.complete_task_assignment(uuid, text) to authenticated;
grant execute on function public.complete_managed_task(uuid, text) to authenticated;
