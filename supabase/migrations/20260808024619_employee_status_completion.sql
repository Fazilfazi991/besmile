-- Employee lifecycle completion. Employment status remains independent from role/RBAC.
alter type public.record_status add value if not exists 'intern';
alter type public.record_status add value if not exists 'probation';
alter type public.record_status add value if not exists 'resigned';

create or replace function public.enforce_employee_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor public.profiles%rowtype;
begin
  if new.status is not distinct from old.status then return new; end if;

  select * into actor from public.profiles where id = (select auth.uid()) and status = 'active';
  if actor.id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if old.id = actor.id then raise exception 'You cannot change your own employment status' using errcode = '42501'; end if;
  if public.profile_role_is_protected(old.role::text) then raise exception 'Protected management accounts cannot be changed' using errcode = '42501'; end if;
  if not (public.has_permission('employees.status.manage') or public.has_permission('employees.manage')) then
    raise exception 'You do not have permission to change employee status' using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.record_employee_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare history_id uuid;
begin
  if new.status is not distinct from old.status then return new; end if;
  insert into public.employee_status_history(profile_id, previous_status, next_status, reason, changed_by)
  values (new.id, old.status, new.status, nullif(current_setting('app.employee_status_reason', true), ''), (select auth.uid()))
  returning id into history_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values ((select auth.uid()), 'employee_status_changed', 'profiles', new.id,
    jsonb_build_object('status', old.status, 'history_id', history_id),
    jsonb_build_object('status', new.status, 'history_id', history_id));
  return new;
end
$$;

drop trigger if exists enforce_employee_status_change on public.profiles;
create trigger enforce_employee_status_change
before update of status on public.profiles
for each row execute function public.enforce_employee_status_change();

drop trigger if exists record_employee_status_change on public.profiles;
create trigger record_employee_status_change
after update of status on public.profiles
for each row execute function public.record_employee_status_change();

create or replace function public.change_employee_status(target_profile uuid, next_status text, change_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare target public.profiles%rowtype;
declare updated public.profiles%rowtype;
begin
  select * into target from public.profiles where id = target_profile;
  if target.id is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if next_status not in ('active', 'inactive', 'on_leave', 'intern', 'probation', 'resigned', 'terminated') then
    raise exception 'Choose a valid employee status' using errcode = '22023';
  end if;
  if next_status in ('inactive', 'resigned', 'terminated') and length(trim(coalesce(change_reason, ''))) < 3 then
    raise exception 'Provide a reason for this status change' using errcode = '22023';
  end if;
  if length(coalesce(change_reason, '')) > 1000 then raise exception 'Status reason must be 1,000 characters or fewer' using errcode = '22023'; end if;

  perform set_config('app.employee_status_reason', coalesce(nullif(trim(change_reason), ''), ''), true);
  update public.profiles set status = next_status::public.record_status where id = target.id returning * into updated;
  return updated;
end
$$;

revoke all on function public.change_employee_status(uuid, text, text) from public, anon;
grant execute on function public.change_employee_status(uuid, text, text) to authenticated;

-- Explicitly retain the established active-only payroll rule. Intern/probation
-- eligibility is a client policy decision, not an access-control inference.
create or replace function public.create_payroll_run_atomic(target_period_start date, target_period_end date)
returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare created_run public.payroll_runs%rowtype;
begin
  if (select auth.uid()) is null or not public.has_permission('payroll.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_period_start is null or target_period_end is null or target_period_end < target_period_start then raise exception 'Invalid payroll period.'; end if;
  insert into public.payroll_runs(period_start, period_end, status, created_by)
  values(target_period_start, target_period_end, 'draft', (select auth.uid())) returning * into created_run;
  insert into public.payroll_entries(payroll_run_id, profile_id, basic_salary, allowances, deductions, payment_status)
  select created_run.id, settings.profile_id, settings.basic_salary, settings.default_allowances, settings.default_deductions, 'draft'
  from public.employee_salary_settings settings join public.profiles profile on profile.id = settings.profile_id
  where settings.is_active and profile.is_employee and profile.status = 'active';
  if not found then raise exception 'No active employee salary settings are available.'; end if;
  return created_run;
end $$;

revoke execute on function public.create_payroll_run_atomic(date, date) from public, anon;
grant execute on function public.create_payroll_run_atomic(date, date) to authenticated, service_role;

notify pgrst, 'reload schema';
