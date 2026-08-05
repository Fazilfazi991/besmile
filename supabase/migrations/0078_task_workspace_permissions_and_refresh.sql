-- Canonical task-management permissions and database-enforced employee status workflow.
insert into public.permissions(code, description) values
  ('tasks.view', 'View all tasks'),
  ('tasks.create', 'Create tasks'),
  ('tasks.manage', 'Manage tasks, assignments, and task status'),
  ('tasks.edit', 'Edit task details'),
  ('tasks.complete', 'Complete and reopen tasks'),
  ('tasks.reassign', 'Reassign tasks')
on conflict (code) do update set description = excluded.description;

-- The General Manager is the task manager. Keep the legacy tasks.assign grant
-- for compatibility with existing assignment-access tooling.
do $$
declare
  task_permissions text[] := array['tasks.view','tasks.create','tasks.manage','tasks.edit','tasks.complete','tasks.reassign','tasks.assign'];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = any(task_permissions)
    where role.code = 'general_manager'
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = any(task_permissions)
    on conflict do nothing;
  end if;
end $$;

alter table public.tasks
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

create or replace function public.task_visible_to_current_user(subject_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('tasks.view')
    or public.has_permission('tasks.manage')
    or exists(
      select 1
      from public.task_assignments assignment
      where assignment.task_id = subject_task
        and (
          assignment.profile_id = auth.uid()
          or (
            public.has_permission('tasks.assign')
            and (public.current_role() <> 'general_manager' or public.in_management_tree(assignment.profile_id))
          )
        )
    )
$$;

create or replace function public.can_manage_task_assignment(subject_task uuid, target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('tasks.manage')
    or (
      public.has_permission('tasks.assign')
      and (
        public.current_role() <> 'general_manager'
        or (
          public.in_management_tree(target_profile)
          and exists(
            select 1 from public.tasks task
            where task.id = subject_task
              and (task.created_by = auth.uid() or exists(
                select 1 from public.task_assignments assignment
                where assignment.task_id = subject_task
                  and public.in_management_tree(assignment.profile_id)
              ))
          )
        )
      )
    )
$$;

create or replace function public.enforce_task_assignment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_permission('tasks.manage') or public.has_permission('tasks.assign') then
    return new;
  end if;

  if old.profile_id <> auth.uid() or new.profile_id <> auth.uid() or new.task_id <> old.task_id then
    raise exception 'Employees can only update their own assigned task status' using errcode = '42501';
  end if;

  if new.status not in ('todo', 'in_progress', 'completed') then
    raise exception 'Invalid task status' using errcode = '22023';
  end if;

  if new.status is distinct from old.status
    and not ((old.status = 'todo' and new.status = 'in_progress')
      or (old.status = 'in_progress' and new.status = 'completed')
      or (old.status = 'completed' and new.status = 'in_progress')) then
    raise exception 'This task cannot move directly to that status' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.sync_task_status_from_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select case
    when bool_and(status = 'completed') then 'completed'
    when bool_or(status = 'in_progress') then 'in_progress'
    else 'todo'
  end into next_status
  from public.task_assignments where task_id = new.task_id;

  update public.tasks
  set status = next_status,
      completed_at = case when next_status = 'completed' then coalesce(completed_at, now()) else null end,
      completed_by = case when next_status = 'completed' then coalesce(completed_by, auth.uid()) else null end
  where id = new.task_id;
  return new;
end
$$;

create or replace function public.record_task_status_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.task_comments(task_id, author_id, body)
    values (new.task_id, auth.uid(), 'Status changed to ' || replace(new.status, '_', ' ') || '.');
  end if;
  return new;
end
$$;

create or replace function public.notify_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  target uuid;
  heading text;
begin
  if new.status is distinct from old.status then
    select created_by into owner from public.tasks where id = new.task_id;
    target := case when public.has_permission('tasks.manage') then new.profile_id else owner end;
    heading := case new.status
      when 'completed' then 'Task completed'
      when 'in_progress' then 'Task in progress'
      else 'Task reopened'
    end;
    if target is not null and target <> auth.uid() then
      perform public.notify_user(
        target, heading, 'Task status was updated.', 'task_updated', new.task_id,
        case when target = new.profile_id then '/employee/tasks' else '/admin/tasks' end,
        auth.uid(), 'tasks', 'medium', 'standard', false
      );
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists enforce_task_assignment_update on public.task_assignments;
create trigger enforce_task_assignment_update before update on public.task_assignments
for each row execute function public.enforce_task_assignment_update();
drop trigger if exists task_assignments_sync_task_status on public.task_assignments;
create trigger task_assignments_sync_task_status after update of status on public.task_assignments
for each row execute function public.sync_task_status_from_assignments();
drop trigger if exists task_assignment_status_activity on public.task_assignments;
create trigger task_assignment_status_activity after update of status on public.task_assignments
for each row execute function public.record_task_status_activity();
drop trigger if exists task_update_notification on public.task_assignments;
create trigger task_update_notification after update of status on public.task_assignments
for each row execute function public.notify_task_update();

drop policy if exists "tasks visible to scoped audience" on public.tasks;
drop policy if exists "tasks visible to assignee or scoped manager" on public.tasks;
create policy "tasks visible to task audience" on public.tasks for select to authenticated
using(public.task_visible_to_current_user(id));

drop policy if exists "tasks scoped manager writes" on public.tasks;
create policy "tasks managed by task managers" on public.tasks for all to authenticated
using(public.has_permission('tasks.manage') or public.has_permission('tasks.assign'))
with check(public.has_permission('tasks.manage') or public.has_permission('tasks.assign'));

drop policy if exists "task assignments read own or scoped manager" on public.task_assignments;
create policy "task assignments read own or task manager" on public.task_assignments for select to authenticated
using(profile_id = auth.uid() or public.has_permission('tasks.view') or public.has_permission('tasks.manage') or public.has_permission('tasks.assign'));

drop policy if exists "task assignments employee status update" on public.task_assignments;
create policy "task assignments employee status update" on public.task_assignments for update to authenticated
using(profile_id = auth.uid() and exists(select 1 from public.profiles profile where profile.id = auth.uid() and profile.status = 'active'))
with check(profile_id = auth.uid() and status in ('todo', 'in_progress', 'completed') and exists(select 1 from public.profiles profile where profile.id = auth.uid() and profile.status = 'active'));

drop policy if exists "task assignments scoped manager inserts" on public.task_assignments;
create policy "task assignments task manager inserts" on public.task_assignments for insert to authenticated
with check(public.can_manage_task_assignment(task_id, profile_id));
drop policy if exists "task assignments scoped manager updates" on public.task_assignments;
create policy "task assignments task manager updates" on public.task_assignments for update to authenticated
using(public.can_manage_task_assignment(task_id, profile_id))
with check(public.can_manage_task_assignment(task_id, profile_id));
drop policy if exists "task assignments scoped manager delete" on public.task_assignments;
create policy "task assignments task manager delete" on public.task_assignments for delete to authenticated
using(public.can_manage_task_assignment(task_id, profile_id));

drop policy if exists "comments visible to task audience" on public.task_comments;
create policy "comments visible to task audience" on public.task_comments for select to authenticated
using(public.task_visible_to_current_user(task_id));
drop policy if exists "comments authored by task audience" on public.task_comments;
create policy "comments authored by task audience" on public.task_comments for insert to authenticated
with check(
  author_id = auth.uid()
  and exists(select 1 from public.profiles profile where profile.id = auth.uid() and profile.status = 'active')
  and (
    exists(select 1 from public.task_assignments assignment where assignment.task_id = task_id and assignment.profile_id = auth.uid())
    or public.has_permission('tasks.manage')
    or public.has_permission('tasks.assign')
  )
);

create index if not exists task_assignments_task_status_idx on public.task_assignments(task_id, status);
