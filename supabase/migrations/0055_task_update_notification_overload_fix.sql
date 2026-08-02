-- Disambiguate task update notifications after the extended notify_user
-- overload was introduced for notification preferences and sounds.
create or replace function public.notify_task_update()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  owner uuid;
begin
  if new.status is distinct from old.status then
    select created_by into owner from public.tasks where id = new.task_id;
    perform public.notify_user(
      owner,
      'Task updated'::text,
      'An employee updated task progress.'::text,
      'task_updated'::text,
      new.task_id,
      '/admin/tasks'::text,
      new.profile_id,
      'tasks'::text,
      'medium'::text,
      'standard'::text,
      false
    );
  end if;
  return new;
end
$$;
