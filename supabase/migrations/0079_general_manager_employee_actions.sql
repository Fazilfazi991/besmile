-- Give the General Manager operational employee-edit and status authority,
-- while keeping Chairman, Director, and Super Admin accounts protected.
alter type public.record_status add value if not exists 'on_leave';
alter type public.record_status add value if not exists 'terminated';

insert into public.permissions(code, description) values
  ('employees.status.manage', 'Change ordinary employee employment status')
on conflict (code) do update set description = excluded.description;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id from public.roles role join public.permissions permission on permission.code in ('employees.edit', 'employees.status.manage')
    where role.code = 'general_manager' on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id from public.permissions permission
    where permission.code in ('employees.edit', 'employees.status.manage') on conflict do nothing;
  end if;
end $$;

create table if not exists public.employee_status_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  previous_status public.record_status not null,
  next_status public.record_status not null,
  reason text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists employee_status_history_profile_created_at_idx on public.employee_status_history(profile_id, created_at desc);
alter table public.employee_status_history enable row level security;

create or replace function public.profile_can_operationally_edit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles target_profile
    where target_profile.id = target
      and (
        auth.uid() = target_profile.id
        or public.has_permission('employees.manage')
        or (
          public.has_permission('employees.edit')
          and not public.profile_role_is_protected(target_profile.role::text)
        )
      )
  )
$$;

drop policy if exists "profiles operationally edited by authorized users" on public.profiles;
create policy "profiles operationally edited by authorized users"
on public.profiles for update to authenticated
using(public.profile_can_operationally_edit(id))
with check(public.profile_can_operationally_edit(id));

drop policy if exists "operational employee activity for authorized management" on public.employee_activity_logs;
create policy "operational employee activity for authorized management"
on public.employee_activity_logs for select to authenticated
using(
  public.has_permission('employees.manage')
  or (
    public.has_permission('employees.view')
    and exists(select 1 from public.profiles target_profile where target_profile.id = profile_id and not public.profile_role_is_protected(target_profile.role::text))
  )
);

drop policy if exists "employee status history readable by employee managers" on public.employee_status_history;
create policy "employee status history readable by employee managers"
on public.employee_status_history for select to authenticated
using(
  public.has_permission('employees.manage')
  or (
    public.has_permission('employees.view')
    and exists(select 1 from public.profiles target_profile where target_profile.id = profile_id and not public.profile_role_is_protected(target_profile.role::text))
  )
);

create or replace function public.change_employee_status(target_profile uuid, next_status text, change_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  target public.profiles;
  updated public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid() and status = 'active';
  if actor.id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into target from public.profiles where id = target_profile;
  if target.id is null then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if target.id = actor.id then raise exception 'You cannot change your own employment status' using errcode = '42501'; end if;
  if public.profile_role_is_protected(target.role::text) then raise exception 'Protected management accounts cannot be changed' using errcode = '42501'; end if;
  if not (public.has_permission('employees.status.manage') or public.has_permission('employees.manage')) then raise exception 'You do not have permission to change employee status' using errcode = '42501'; end if;
  if next_status not in ('active','inactive','on_leave','terminated') then raise exception 'Choose a valid employee status' using errcode = '22023'; end if;
  if next_status in ('inactive','terminated') and length(trim(coalesce(change_reason,''))) < 3 then raise exception 'Provide a reason for this status change' using errcode = '22023'; end if;
  if length(coalesce(change_reason,'')) > 1000 then raise exception 'Status reason must be 1,000 characters or fewer' using errcode = '22023'; end if;

  update public.profiles set status = next_status::public.record_status where id = target.id returning * into updated;
  insert into public.employee_status_history(profile_id, previous_status, next_status, reason, changed_by)
  values(target.id, target.status, next_status::public.record_status, nullif(trim(change_reason), ''), actor.id);
  return updated;
end
$$;

revoke all on function public.change_employee_status(uuid, text, text) from public;
grant execute on function public.change_employee_status(uuid, text, text) to authenticated;
