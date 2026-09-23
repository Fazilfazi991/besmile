-- Organization fields remain on profiles; no duplicate people or portrait data.
insert into public.departments(name) values ('Business Development'), ('Marketing') on conflict (name) do nothing;

-- Employee edit intentionally protects leadership accounts. This narrow grant permits
-- ONLY organization fields for leadership, without granting broader HR/security access.
insert into public.permissions(code,description) values ('organization_chart.manage','Edit organization reporting managers, departments and designations') on conflict(code) do nothing;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id)
    select r.id,p.id from public.roles r cross join public.permissions p
    where r.code in ('super_admin','chairman','director') and p.code='organization_chart.manage' on conflict do nothing;
  else
    insert into public.role_permissions(role,permission_id)
    select role_name::public.employee_role,p.id from unnest(array['Chairman','Director']) role_name cross join public.permissions p
    where p.code='organization_chart.manage' on conflict do nothing;
  end if;
end $$;

-- A projection is necessary: ordinary staff must never SELECT other people's HR columns.
create or replace function public.organization_directory()
returns table(id uuid,full_name text,designation text,manager_id uuid,department_id uuid,department_name text,avatar_url text,status text,can_edit boolean)
language sql stable security definer set search_path=public as $$
  select p.id,p.full_name,p.designation,p.manager_id,p.department_id,d.name,p.avatar_url,p.status::text,
    (public.has_permission('organization_chart.manage') or public.has_permission('employees.manage') or
      (public.has_permission('employees.edit') and not public.profile_role_is_protected(p.role::text)))
  from public.profiles p left join public.departments d on d.id=p.department_id
  where auth.uid() is not null and exists(select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.status='active' and (viewer.is_employee or viewer.role::text in ('super_admin','chairman','director')))
    and p.status='active' and p.removed_at is null
    and ((p.is_employee and p.workforce_visible) or p.role::text in ('chairman','director'))
  order by p.full_name,p.id
$$;
revoke all on function public.organization_directory() from public,anon;
grant execute on function public.organization_directory() to authenticated;

-- Only the current avatar of an eligible active coworker is shared; old objects stay private.
drop policy if exists "organization current profile photo" on storage.objects;
create policy "organization current profile photo" on storage.objects for select to authenticated
using(bucket_id='profile-photos' and exists(select 1 from public.organization_directory() person where person.avatar_url=storage.objects.name));

-- Validate against the whole graph, including rows hidden from the editing user's HR view.
-- The advisory lock serializes hierarchy writes; UNION also terminates on legacy cycles.
create or replace function public.prevent_reporting_cycle() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and new.manager_id is not distinct from old.manager_id and new.designation is not distinct from old.designation then return new; end if;
  perform pg_advisory_xact_lock(824713092);
  if new.manager_id is null then return new; end if;
  if lower(trim(coalesce(new.designation,'')))='chairman' then raise exception 'The Chairman must remain at the top with no reporting manager'; end if;
  if new.manager_id=new.id then raise exception 'An employee cannot report to themselves'; end if;
  if not exists(select 1 from public.profiles where id=new.manager_id and status='active' and removed_at is null) then raise exception 'Choose an active reporting manager'; end if;
  if exists(with recursive ancestors as (
    select id,manager_id from public.profiles where id=new.manager_id
    union select p.id,p.manager_id from public.profiles p join ancestors a on p.id=a.manager_id
  ) select 1 from ancestors where id=new.id) then raise exception 'Reporting relationship would create a circular hierarchy'; end if;
  return new;
end $$;
revoke all on function public.prevent_reporting_cycle() from public,anon,authenticated;
drop trigger if exists profiles_prevent_reporting_cycle on public.profiles;
create trigger profiles_prevent_reporting_cycle before insert or update of manager_id,designation on public.profiles for each row execute function public.prevent_reporting_cycle();

-- Narrow mutation endpoint is needed for protected leadership organization fields.
-- No role, login, permission, name, status, photo, or private HR fields are accepted.
create or replace function public.update_organization_employee(employee_id uuid,reporting_manager_id uuid,employee_department_id uuid,employee_designation text)
returns void language plpgsql security definer set search_path=public as $$
declare target public.profiles;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501'; end if;
  if not (public.has_permission('organization_chart.manage') or public.has_permission('employees.manage') or public.has_permission('employees.edit')) then raise exception 'Organization editing is not permitted' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(824713092);
  select * into target from public.profiles where id=employee_id and status='active' and removed_at is null and ((is_employee and workforce_visible) or role::text in ('chairman','director')) for update;
  if target.id is null then raise exception 'Active employee not found'; end if;
  if public.profile_role_is_protected(target.role::text) and not (public.has_permission('organization_chart.manage') or public.has_permission('employees.manage')) then raise exception 'Protected organization position' using errcode='42501'; end if;
  if length(trim(coalesce(employee_designation,''))) not between 1 and 150 then raise exception 'Position must contain 1 to 150 characters'; end if;
  if employee_department_id is not null and not exists(select 1 from public.departments where id=employee_department_id and is_active) then raise exception 'Choose an active department'; end if;
  update public.profiles set manager_id=reporting_manager_id,department_id=employee_department_id,designation=trim(employee_designation),updated_at=now() where id=employee_id;
end $$;
revoke all on function public.update_organization_employee(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.update_organization_employee(uuid,uuid,uuid,text) to authenticated;

-- Add custom lookup values, not the literal placeholder "Other". Existing RLS remains in force.
drop policy if exists "employee managers create departments" on public.departments;
create policy "employee managers create departments" on public.departments for insert to authenticated
with check(public.has_permission('employees.create') or public.has_permission('employees.edit') or public.has_permission('employees.manage') or public.has_permission('organization_chart.manage'));
create or replace function public.create_employee_department(department_name text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; clean_name text:=trim(regexp_replace(department_name,'\s+',' ','g'));
begin
  if auth.uid() is null or not (public.has_permission('employees.create') or public.has_permission('employees.edit') or public.has_permission('employees.manage') or public.has_permission('organization_chart.manage')) then raise exception 'Department creation is not permitted' using errcode='42501'; end if;
  if clean_name is null or length(clean_name) not between 2 and 100 or lower(clean_name)='other' then raise exception 'Enter a specific department name (2 to 100 characters)'; end if;
  perform pg_advisory_xact_lock(824713093);
  select id into result from public.departments where lower(name)=lower(clean_name) and is_active order by id limit 1;
  if result is null then insert into public.departments(name) values(clean_name) returning id into result; end if;
  return result;
end $$;
revoke all on function public.create_employee_department(text) from public,anon;
grant execute on function public.create_employee_department(text) to authenticated;
