-- Configurable task assignment access. Chairman and Director remain implicit
-- administrators; operational access can be granted temporarily to any active employee.
insert into public.permissions(code,description) values
  ('tasks.assign','Create, assign, reassign and manage tasks'),
  ('tasks.manage_access','Grant or revoke task assignment access')
on conflict(code) do update set description=excluded.description;

-- The connected project may have the original role_permissions(role, permission_id)
-- schema or the newer role_permissions(role_id, permission_id) schema. Seed both safely.
do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id)
    select r.id,p.id from public.roles r cross join public.permissions p
    where r.code in ('chairman','director') and p.code in ('tasks.assign','tasks.manage_access')
    on conflict do nothing;
  else
    execute $sql$
      insert into public.role_permissions(role,permission_id)
      select case r.code when 'chairman' then 'Chairman'::public.employee_role when 'director' then 'Director'::public.employee_role end,p.id
      from public.roles r cross join public.permissions p
      where r.code in ('chairman','director') and p.code in ('tasks.assign','tasks.manage_access')
      on conflict do nothing
    $sql$;
  end if;
end $$;

create table if not exists public.user_permission_grants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  reason text,
  expired_logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_permission_grants_date_order check (expires_at is null or expires_at > starts_at)
);
create index if not exists user_permission_grants_effective_idx on public.user_permission_grants(profile_id,permission_id,starts_at,expires_at) where revoked_at is null;
create index if not exists user_permission_grants_permission_idx on public.user_permission_grants(permission_id) where revoked_at is null;
drop trigger if exists user_permission_grants_touch_updated_at on public.user_permission_grants;
create trigger user_permission_grants_touch_updated_at before update on public.user_permission_grants for each row execute function public.touch_updated_at();

create or replace function public.role_has_permission(subject_role public.app_role, permission_code text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare allowed boolean;
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    execute 'select exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.code=$1 and p.code=$2)' into allowed using subject_role,permission_code;
  else
    execute 'select exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where lower(replace(rp.role::text,'' '',''_'') )=$1::text and p.code=$2)' into allowed using subject_role,permission_code;
  end if;
  return coalesce(allowed,false);
end $$;

create or replace function public.has_permission(permission_code text, subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles subject
    where subject.id=subject_id and subject.status='active' and (
      subject.role in ('chairman','director')
      or public.role_has_permission(subject.role,permission_code)
      or exists(select 1 from public.user_permission_grants g join public.permissions p on p.id=g.permission_id where g.profile_id=subject.id and p.code=permission_code and g.revoked_at is null and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now()))
    )
  );
$$;

-- Stable seeded operational accounts, addressed by their seeded work emails.
insert into public.user_permission_grants(profile_id,permission_id,reason)
select pr.id,pe.id,'Default operational task-assignment access'
from public.profiles pr join public.permissions pe on pe.code='tasks.assign'
where lower(pr.email) in ('fayiz@bsmile.local','diya.anthikat@bsmile.local') and pr.status='active'
  and not exists(select 1 from public.user_permission_grants g where g.profile_id=pr.id and g.permission_id=pe.id and g.revoked_at is null);

alter table public.user_permission_grants enable row level security;
drop policy if exists "permission grants readable by subject or manager" on public.user_permission_grants;
drop policy if exists "permission grants managed by authorized users" on public.user_permission_grants;
create policy "permission grants readable by subject or manager" on public.user_permission_grants for select to authenticated using(profile_id=auth.uid() or public.has_permission('tasks.manage_access'));
create policy "permission grants managed by authorized users" on public.user_permission_grants for all to authenticated using(public.has_permission('tasks.manage_access')) with check(public.has_permission('tasks.manage_access'));

create or replace function public.audit_permission_grant_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='INSERT' then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'permission_granted','user_permission_grants',new.id,to_jsonb(new));
  elsif TG_OP='UPDATE' and old.revoked_at is null and new.revoked_at is not null then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'permission_revoked','user_permission_grants',new.id,to_jsonb(old),to_jsonb(new));
  end if;
  return new;
end $$;
drop trigger if exists user_permission_grants_audit on public.user_permission_grants;
create trigger user_permission_grants_audit after insert or update on public.user_permission_grants for each row execute function public.audit_permission_grant_event();

-- Expiry affects authorization immediately through has_permission; this function records
-- that transition the next time an authorized access-management screen is opened.
create or replace function public.record_expired_task_permissions() returns void language plpgsql security definer set search_path=public as $$
declare grant_row record;
begin
  if not public.has_permission('tasks.manage_access') then raise exception 'Not authorized'; end if;
  for grant_row in select g.* from public.user_permission_grants g join public.permissions p on p.id=g.permission_id where p.code in ('tasks.assign','tasks.manage_access') and g.revoked_at is null and g.expires_at<=now() and g.expired_logged_at is null loop
    update public.user_permission_grants set expired_logged_at=now() where id=grant_row.id;
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'permission_expired','user_permission_grants',grant_row.id,to_jsonb(grant_row));
  end loop;
end $$;

-- Replace role-only task policies with the effective permission check.
drop policy if exists "tasks visible to assignee or management" on public.tasks;
drop policy if exists "tasks managers write" on public.tasks;
create policy "tasks visible to assignee or authorized manager" on public.tasks for select to authenticated using(
  public.has_permission('tasks.assign') or exists(select 1 from public.task_assignments a where a.task_id=id and a.profile_id=auth.uid())
);
create policy "tasks authorized managers write" on public.tasks for all to authenticated using(public.has_permission('tasks.assign')) with check(public.has_permission('tasks.assign'));

drop policy if exists "task assignments read own or hierarchy" on public.task_assignments;
drop policy if exists "task assignments manager writes" on public.task_assignments;
drop policy if exists "task assignments manager update" on public.task_assignments;
create policy "task assignments read own or authorized manager" on public.task_assignments for select to authenticated using(profile_id=auth.uid() or public.has_permission('tasks.assign'));
create policy "task assignments authorized manager writes" on public.task_assignments for insert to authenticated with check(public.has_permission('tasks.assign'));
create policy "task assignments authorized manager update" on public.task_assignments for update to authenticated using(public.has_permission('tasks.assign')) with check(public.has_permission('tasks.assign'));
create or replace function public.enforce_task_assignment_update() returns trigger language plpgsql security definer set search_path=public as $$ begin if old.profile_id=auth.uid() and not public.has_permission('tasks.assign') and (new.task_id is distinct from old.task_id or new.profile_id is distinct from old.profile_id) then raise exception 'Employees cannot reassign tasks'; end if; return new; end $$;

drop policy if exists "comments visible to task audience" on public.task_comments;
drop policy if exists "comments authored by task audience" on public.task_comments;
create policy "comments visible to task audience" on public.task_comments for select to authenticated using(
  public.has_permission('tasks.assign') or exists(select 1 from public.task_assignments a where a.task_id=task_id and a.profile_id=auth.uid())
);
create policy "comments authored by task audience" on public.task_comments for insert to authenticated with check(
  author_id=auth.uid() and (public.has_permission('tasks.assign') or exists(select 1 from public.task_assignments a where a.task_id=task_id and a.profile_id=auth.uid()))
);

create or replace function public.audit_task_assignment_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_TABLE_NAME='tasks' and TG_OP='INSERT' then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'task_created','tasks',new.id,to_jsonb(new));
  elsif TG_TABLE_NAME='task_assignments' and TG_OP='UPDATE' and new.profile_id is distinct from old.profile_id then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'task_reassigned','task_assignments',new.id,to_jsonb(old),to_jsonb(new));
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists tasks_assignment_audit_event on public.tasks;
create trigger tasks_assignment_audit_event after insert on public.tasks for each row execute function public.audit_task_assignment_event();
drop trigger if exists task_assignments_assignment_audit_event on public.task_assignments;
create trigger task_assignments_assignment_audit_event after update on public.task_assignments for each row execute function public.audit_task_assignment_event();
