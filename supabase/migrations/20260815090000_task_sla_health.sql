-- Additive SLA metadata. Legacy tasks continue to use their existing due_date.
alter table public.tasks
  add column if not exists start_date date,
  add column if not exists sla_duration numeric(10,2),
  add column if not exists sla_unit text,
  add column if not exists sla_deadline timestamptz;

alter table public.tasks
  drop constraint if exists tasks_sla_duration_positive,
  add constraint tasks_sla_duration_positive check (sla_duration is null or sla_duration > 0),
  drop constraint if exists tasks_sla_unit_check,
  add constraint tasks_sla_unit_check check (sla_unit is null or sla_unit in ('hours', 'working_days'));

-- Team Today joins active assignments in one batch; this index supports that path.
create index if not exists task_assignments_profile_active_idx
  on public.task_assignments(profile_id, status, task_id)
  where status <> 'completed';
