-- Batch 10: management-only, current-state work visibility. This deliberately
-- reports date-based due work and current ownership; it does not calculate SLA,
-- rankings, historical reassignment attribution, or timestamp-level lateness.
insert into public.permissions(code, description) values
  ('work_performance.view', 'View management work and performance visibility')
on conflict (code) do update set description = excluded.description;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'work_performance.view'
    where role.code::text in ('chairman', 'director', 'general_manager')
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select legacy_role.role_name::public.employee_role, permission.id
    from (values ('Chairman'), ('Director'), ('General Manager')) as legacy_role(role_name)
    join public.permissions permission on permission.code = 'work_performance.view'
    on conflict do nothing;
  end if;
end $$;

create or replace function public.work_performance_summary(p_period_start date, p_period_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  business_day date := (now() at time zone public.business_timezone())::date;
  payload jsonb;
begin
  if auth.uid() is null or not public.has_permission('work_performance.view') then
    raise exception 'Work & Performance access is required' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_period_start > p_period_end then
    raise exception 'A valid reporting period is required' using errcode = '22023';
  end if;

  with workforce as (
    select profile.id, profile.full_name, profile.employee_code, profile.designation, department.name as department_name
    from public.profiles profile
    left join public.departments department on department.id = profile.department_id
    where profile.is_employee
      and profile.workforce_visible
      and profile.login_enabled
      and profile.status::text = 'active'
  ), task_snapshot as (
    select
      count(*) filter (where task.status = 'todo') as todo,
      count(*) filter (where task.status = 'in_progress') as in_progress,
      count(*) filter (where task.status = 'completed') as completed,
      count(*) filter (where task.status <> 'completed' and task.due_date = business_day) as due_today,
      count(*) filter (where task.status <> 'completed' and task.due_date < business_day) as overdue,
      count(*) filter (where task.status = 'completed' and task.completed_at >= (p_period_start::timestamp at time zone public.business_timezone()) and task.completed_at < ((p_period_end + 1)::timestamp at time zone public.business_timezone())) as completed_in_period
    from public.tasks task
  ), workload as (
    select
      workforce.id,
      count(assignment.task_id) filter (where assignment.status = 'todo') as todo,
      count(assignment.task_id) filter (where assignment.status = 'in_progress') as in_progress,
      count(assignment.task_id) filter (where assignment.status = 'completed') as completed,
      count(assignment.task_id) filter (where assignment.status <> 'completed') as open_tasks,
      count(assignment.task_id) filter (where task.status <> 'completed' and task.due_date = business_day) as due_today_tasks,
      count(assignment.task_id) filter (where task.status <> 'completed' and task.due_date < business_day) as overdue_tasks,
      count(assignment.task_id) filter (where assignment.status = 'completed' and task.completed_at >= (p_period_start::timestamp at time zone public.business_timezone()) and task.completed_at < ((p_period_end + 1)::timestamp at time zone public.business_timezone())) as completed_in_period
    from workforce
    left join public.task_assignments assignment on assignment.profile_id = workforce.id
    left join public.tasks task on task.id = assignment.task_id
    group by workforce.id
  ), attendance_today as (
    select attendance.profile_id, bool_or(attendance.clock_in is not null) as attendance_recorded, max(attendance.status) as attendance_status
    from public.attendance attendance
    where attendance.work_date = business_day
    group by attendance.profile_id
  ), leave_today as (
    select distinct leave_request.profile_id
    from public.leave_requests leave_request
    where leave_request.status = 'approved'
      and leave_request.starts_on <= business_day
      and leave_request.ends_on >= business_day
  ), employees as (
    select jsonb_agg(jsonb_build_object(
      'id', workforce.id,
      'full_name', workforce.full_name,
      'employee_code', workforce.employee_code,
      'designation', workforce.designation,
      'department_name', workforce.department_name,
      'todo', coalesce(workload.todo, 0),
      'in_progress', coalesce(workload.in_progress, 0),
      'completed', coalesce(workload.completed, 0),
      'open_tasks', coalesce(workload.open_tasks, 0),
      'due_today_tasks', coalesce(workload.due_today_tasks, 0),
      'overdue_tasks', coalesce(workload.overdue_tasks, 0),
      'completed_in_period', coalesce(workload.completed_in_period, 0),
      'attendance_recorded', coalesce(attendance_today.attendance_recorded, false),
      'attendance_status', attendance_today.attendance_status,
      'on_leave', leave_today.profile_id is not null
    ) order by workforce.full_name) as rows
    from workforce
    left join workload on workload.id = workforce.id
    left join attendance_today on attendance_today.profile_id = workforce.id
    left join leave_today on leave_today.profile_id = workforce.id
  )
  select jsonb_build_object(
    'business_date', business_day,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'snapshot', jsonb_build_object(
      'todo', coalesce(task_snapshot.todo, 0),
      'in_progress', coalesce(task_snapshot.in_progress, 0),
      'completed', coalesce(task_snapshot.completed, 0),
      'open_tasks', coalesce(task_snapshot.todo, 0) + coalesce(task_snapshot.in_progress, 0),
      'due_today', coalesce(task_snapshot.due_today, 0),
      'overdue', coalesce(task_snapshot.overdue, 0),
      'completed_in_period', coalesce(task_snapshot.completed_in_period, 0)
    ),
    'employees', coalesce(employees.rows, '[]'::jsonb)
  ) into payload
  from task_snapshot cross join employees;

  return payload;
end;
$$;

revoke execute on function public.work_performance_summary(date, date) from public, anon;
grant execute on function public.work_performance_summary(date, date) to authenticated;

create index if not exists tasks_completed_at_idx on public.tasks(completed_at) where completed_at is not null;
