-- Keep the security audit private while exposing a minimal, operational
-- employee activity stream to the managers who are allowed to manage a person.
create table if not exists public.employee_activity_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('employee_created','employee_updated','employee_activated','employee_deactivated')),
  changes jsonb not null default '{}'::jsonb,
  source_audit_id uuid unique references public.audit_logs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists employee_activity_logs_profile_created_at_idx on public.employee_activity_logs(profile_id, created_at desc);

alter table public.employee_activity_logs enable row level security;

drop policy if exists "operational employee activity for authorized management" on public.employee_activity_logs;
create policy "operational employee activity for authorized management"
on public.employee_activity_logs for select to authenticated
using (
  public.is_super_admin()
  or public.current_role() in ('chairman', 'director')
  or (public.current_role() = 'general_manager' and public.in_management_tree(profile_id))
);

create or replace function public.profile_operational_activity_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  changed jsonb;
  event_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.employee_activity_logs(profile_id, actor_id, action, changes)
    values (new.id, auth.uid(), 'employee_created', jsonb_build_object('employee_code', new.employee_code, 'full_name', new.full_name));
    return new;
  end if;

  changed := jsonb_strip_nulls(jsonb_build_object(
    'full_name', case when new.full_name is distinct from old.full_name then jsonb_build_object('from', old.full_name, 'to', new.full_name) end,
    'phone', case when new.phone is distinct from old.phone then jsonb_build_object('from', old.phone, 'to', new.phone) end,
    'department_id', case when new.department_id is distinct from old.department_id then jsonb_build_object('from', old.department_id, 'to', new.department_id) end,
    'designation', case when new.designation is distinct from old.designation then jsonb_build_object('from', old.designation, 'to', new.designation) end,
    'manager_id', case when new.manager_id is distinct from old.manager_id then jsonb_build_object('from', old.manager_id, 'to', new.manager_id) end,
    'joining_date', case when new.joining_date is distinct from old.joining_date then jsonb_build_object('from', old.joining_date, 'to', new.joining_date) end,
    'employment_type', case when new.employment_type is distinct from old.employment_type then jsonb_build_object('from', old.employment_type, 'to', new.employment_type) end,
    'status', case when new.status is distinct from old.status then jsonb_build_object('from', old.status, 'to', new.status) end
  ));
  if changed = '{}'::jsonb then return new; end if;
  event_action := case
    when changed ? 'status' and new.status = 'active' then 'employee_activated'
    when changed ? 'status' and new.status = 'inactive' then 'employee_deactivated'
    else 'employee_updated'
  end;
  insert into public.employee_activity_logs(profile_id, actor_id, action, changes)
  values (new.id, auth.uid(), event_action, changed);
  return new;
end $$;

drop trigger if exists profiles_operational_activity on public.profiles;
create trigger profiles_operational_activity
after insert or update on public.profiles
for each row execute function public.profile_operational_activity_event();

-- Backfill only profile events and only the operational fields that this table
-- is designed to expose. Existing security audit data remains restricted.
insert into public.employee_activity_logs(profile_id, actor_id, action, changes, source_audit_id, created_at)
select
  audit.entity_id,
  audit.actor_id,
  case when audit.action = 'insert' then 'employee_created' else 'employee_updated' end,
  jsonb_strip_nulls(jsonb_build_object(
    'full_name', case when audit.after_data->>'full_name' is distinct from audit.before_data->>'full_name' then jsonb_build_object('from', audit.before_data->>'full_name', 'to', audit.after_data->>'full_name') end,
    'phone', case when audit.after_data->>'phone' is distinct from audit.before_data->>'phone' then jsonb_build_object('from', audit.before_data->>'phone', 'to', audit.after_data->>'phone') end,
    'department_id', case when audit.after_data->>'department_id' is distinct from audit.before_data->>'department_id' then jsonb_build_object('from', audit.before_data->>'department_id', 'to', audit.after_data->>'department_id') end,
    'designation', case when audit.after_data->>'designation' is distinct from audit.before_data->>'designation' then jsonb_build_object('from', audit.before_data->>'designation', 'to', audit.after_data->>'designation') end,
    'manager_id', case when audit.after_data->>'manager_id' is distinct from audit.before_data->>'manager_id' then jsonb_build_object('from', audit.before_data->>'manager_id', 'to', audit.after_data->>'manager_id') end,
    'joining_date', case when audit.after_data->>'joining_date' is distinct from audit.before_data->>'joining_date' then jsonb_build_object('from', audit.before_data->>'joining_date', 'to', audit.after_data->>'joining_date') end,
    'employment_type', case when audit.after_data->>'employment_type' is distinct from audit.before_data->>'employment_type' then jsonb_build_object('from', audit.before_data->>'employment_type', 'to', audit.after_data->>'employment_type') end,
    'status', case when audit.after_data->>'status' is distinct from audit.before_data->>'status' then jsonb_build_object('from', audit.before_data->>'status', 'to', audit.after_data->>'status') end
  )),
  audit.id,
  audit.created_at
from public.audit_logs audit
where audit.entity_type = 'profiles'
  and audit.entity_id is not null
on conflict (source_audit_id) do nothing;
