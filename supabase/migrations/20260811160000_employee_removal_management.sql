-- Applied after the deployed Chat migrations.
begin;

-- Employee removal is an employment lifecycle operation. The profile row and
-- all business-history foreign keys remain intact.
alter table public.profiles
  add column if not exists removed_at timestamptz,
  add column if not exists removal_reason text,
  add column if not exists removed_by uuid references public.profiles(id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_removal_reason_length;
alter table public.profiles
  add constraint profiles_removal_reason_length
  check (removal_reason is null or char_length(removal_reason) between 3 and 1000);

create index if not exists profiles_removed_at_idx
  on public.profiles(removed_at desc)
  where removed_at is not null;

-- The browser-facing authenticated role has no physical profile-delete path.
-- Service-side user administration remains outside this workforce workflow.
revoke delete on table public.profiles from authenticated, anon;

insert into public.permissions(code, description)
values ('employees.remove', 'Remove and restore ordinary employee accounts')
on conflict(code) do update set description = excluded.description;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'employees.remove'
    where role.code in ('chairman', 'director', 'general_manager')
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select role_name::public.employee_role, permission.id
    from unnest(array['Chairman', 'Director', 'General Manager']) role_name
    cross join public.permissions permission
    where permission.code = 'employees.remove'
    on conflict do nothing;
  end if;
end $$;

-- The existing status trigger remains the final guard for direct profile
-- updates. A scoped transaction flag distinguishes the dedicated remove and
-- restore RPCs from ordinary status changes.
create or replace function public.enforce_employee_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  lifecycle_action text := current_setting('app.employee_removal_action', true);
begin
  if new.status is not distinct from old.status then return new; end if;

  select * into actor
  from public.profiles
  where id = (select auth.uid()) and status = 'active';

  if actor.id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if old.id = actor.id then
    raise exception 'You cannot remove or change your own employment status' using errcode = '42501';
  end if;
  if public.profile_role_is_protected(old.role::text) then
    raise exception 'Protected management accounts cannot be changed' using errcode = '42501';
  end if;

  if lifecycle_action = 'remove' then
    if not public.has_permission('employees.remove') or new.status::text <> 'inactive' then
      raise exception 'You do not have permission to remove this employee' using errcode = '42501';
    end if;
  elsif lifecycle_action = 'restore' then
    if not public.has_permission('employees.remove') or new.status::text <> 'active' then
      raise exception 'You do not have permission to restore this employee' using errcode = '42501';
    end if;
  elsif not (public.has_permission('employees.status.manage') or public.has_permission('employees.manage')) then
    raise exception 'You do not have permission to change employee status' using errcode = '42501';
  end if;

  return new;
end
$$;

create or replace function public.remove_employee(target_profile uuid, removal_reason text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
  updated public.profiles%rowtype;
  reason text := trim(coalesce(removal_reason, ''));
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid()) and status = 'active';
  if actor.id is null or not public.has_permission('employees.remove') then
    raise exception 'You do not have permission to remove employees' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = target_profile for update;
  if target.id is null or not target.is_employee then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if target.id = actor.id then
    raise exception 'You cannot remove your own employee account' using errcode = '42501';
  end if;
  if public.profile_role_is_protected(target.role::text) then
    raise exception 'Protected management accounts cannot be removed' using errcode = '42501';
  end if;
  if target.status::text not in ('active', 'intern', 'probation', 'on_leave') then
    raise exception 'Only a current employee can be removed' using errcode = '22023';
  end if;
  if char_length(reason) < 3 or char_length(reason) > 1000 then
    raise exception 'Provide a removal reason between 3 and 1,000 characters' using errcode = '22023';
  end if;

  perform set_config('app.employee_removal_action', 'remove', true);
  perform set_config('app.employee_status_reason', reason, true);
  update public.profiles
  set status = 'inactive'::public.record_status,
      login_enabled = false,
      removed_at = now(),
      removal_reason = reason,
      removed_by = actor.id,
      updated_at = now()
  where id = target.id
  returning * into updated;

  update public.user_permission_grants
  set revoked_at = coalesce(revoked_at, now()),
      revoked_by = coalesce(revoked_by, actor.id),
      updated_at = now()
  where profile_id = target.id and revoked_at is null;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    actor.id,
    'employee_removed',
    'profiles',
    target.id,
    jsonb_build_object('status', target.status, 'login_enabled', target.login_enabled),
    jsonb_build_object('status', updated.status, 'login_enabled', updated.login_enabled, 'reason', reason, 'removed_at', updated.removed_at)
  );

  return updated;
end
$$;

create or replace function public.restore_employee(target_profile uuid, restore_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
  updated public.profiles%rowtype;
  reason text := trim(coalesce(restore_reason, 'Restored to current workforce'));
begin
  select * into actor
  from public.profiles
  where id = (select auth.uid()) and status = 'active';
  if actor.id is null or not public.has_permission('employees.remove') then
    raise exception 'You do not have permission to restore employees' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = target_profile for update;
  if target.id is null or not target.is_employee then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if target.id = actor.id then
    raise exception 'You cannot restore your own employee account through this action' using errcode = '42501';
  end if;
  if public.profile_role_is_protected(target.role::text) then
    raise exception 'Protected management accounts cannot be restored through this action' using errcode = '42501';
  end if;
  if target.status::text <> 'inactive' or target.removed_at is null then
    raise exception 'Only an administratively removed employee can be restored' using errcode = '22023';
  end if;
  if char_length(reason) < 3 or char_length(reason) > 1000 then
    raise exception 'Restore reason must be between 3 and 1,000 characters' using errcode = '22023';
  end if;

  perform set_config('app.employee_removal_action', 'restore', true);
  perform set_config('app.employee_status_reason', reason, true);
  update public.profiles
  set status = 'active'::public.record_status,
      login_enabled = true,
      removed_at = null,
      removal_reason = null,
      removed_by = null,
      updated_at = now()
  where id = target.id
  returning * into updated;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    actor.id,
    'employee_restored',
    'profiles',
    target.id,
    jsonb_build_object('status', target.status, 'removed_at', target.removed_at, 'removal_reason', target.removal_reason),
    jsonb_build_object('status', updated.status, 'reason', reason, 'direct_grants_restored', false)
  );

  return updated;
end
$$;

revoke all on function public.remove_employee(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_employee(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_employee(uuid, text) to authenticated;
grant execute on function public.restore_employee(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
