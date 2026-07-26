create extension if not exists pgcrypto;
do $$ begin create type public.app_role as enum ('chairman','director','general_manager','staff'); exception when duplicate_object then null; end $$;
do $$ begin create type public.record_status as enum ('active','inactive'); exception when duplicate_object then null; end $$;

create table if not exists public.departments (id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz not null default now());
create table if not exists public.roles (id uuid primary key default gen_random_uuid(), code public.app_role not null unique, name text not null);
create table if not exists public.permissions (id uuid primary key default gen_random_uuid(), code text not null unique, description text);
create table if not exists public.role_permissions (role_id uuid not null references public.roles(id) on delete cascade, permission_id uuid not null references public.permissions(id) on delete cascade, primary key(role_id,permission_id));
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, full_name text not null, email text not null unique, role public.app_role not null default 'staff', designation text, department_id uuid references public.departments(id) on delete set null, manager_id uuid references public.profiles(id) on delete set null, avatar_url text, status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Upgrade the preliminary CRM schema, whose role column used the legacy employee_role enum.
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type public.app_role using (
  case role::text
    when 'Chairman' then 'chairman'
    when 'Director' then 'director'
    when 'General Manager' then 'general_manager'
    when 'Staff' then 'staff'
    else lower(replace(role::text, ' ', '_'))
  end
)::public.app_role;
alter table public.profiles alter column role set default 'staff';
create table if not exists public.attendance (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade, work_date date not null, clock_in timestamptz, clock_out timestamptz, status text not null default 'present', unique(profile_id,work_date));
create table if not exists public.leave_requests (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id), leave_type text not null, starts_on date not null, ends_on date not null, reason text, status text not null default 'pending', approver_id uuid references public.profiles(id), created_at timestamptz not null default now());
create table if not exists public.tasks (id uuid primary key default gen_random_uuid(), title text not null, description text, assignee_id uuid references public.profiles(id), status text not null default 'todo', priority text not null default 'medium', due_date date, created_at timestamptz not null default now());
create table if not exists public.clients (id uuid primary key default gen_random_uuid(), name text not null, contact_name text, email text, status text not null default 'active', created_at timestamptz not null default now());
create table if not exists public.enquiries (id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id), subject text not null, status text not null default 'open', owner_id uuid references public.profiles(id), created_at timestamptz not null default now());
create table if not exists public.chat_conversations (id uuid primary key default gen_random_uuid(), title text, conversation_type text not null default 'personal', department_id uuid references public.departments(id), created_at timestamptz not null default now());
create table if not exists public.chat_members (conversation_id uuid not null references public.chat_conversations(id) on delete cascade, profile_id uuid not null references public.profiles(id) on delete cascade, last_read_at timestamptz, primary key(conversation_id,profile_id));
create table if not exists public.chat_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.chat_conversations(id) on delete cascade, sender_id uuid not null references public.profiles(id), body text not null, created_at timestamptz not null default now());
create table if not exists public.documents (id uuid primary key default gen_random_uuid(), title text not null, category text, storage_path text, uploaded_by uuid references public.profiles(id), created_at timestamptz not null default now());
create table if not exists public.announcements (id uuid primary key default gen_random_uuid(), title text not null, body text not null, author_id uuid references public.profiles(id), published_at timestamptz not null default now());
create table if not exists public.notifications (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id), title text not null, body text, type text, read_at timestamptz, created_at timestamptz not null default now());

drop function if exists public.in_management_tree(uuid) cascade;
drop function if exists public.is_management() cascade;
drop function if exists public.current_role() cascade;
create function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.is_management() returns boolean language sql stable security definer set search_path=public as $$ select public.current_role() in ('chairman','director') $$;
create or replace function public.in_management_tree(target uuid) returns boolean language sql stable security definer set search_path=public as $$ with recursive tree as (select id from public.profiles where id=auth.uid() union all select p.id from public.profiles p join tree t on p.manager_id=t.id) select exists(select 1 from tree where id=target) $$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists profiles_touch_updated_at on public.profiles; create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security; alter table public.attendance enable row level security; alter table public.leave_requests enable row level security; alter table public.tasks enable row level security; alter table public.notifications enable row level security;
drop policy if exists "profiles readable by signed in users" on public.profiles; drop policy if exists "profiles edited by management or self" on public.profiles; drop policy if exists "attendance own or hierarchy" on public.attendance; drop policy if exists "leave own or hierarchy" on public.leave_requests; drop policy if exists "tasks visible to assignee or management" on public.tasks; drop policy if exists "notifications are private" on public.notifications;
create policy "profiles readable by signed in users" on public.profiles for select to authenticated using (true);
create policy "profiles edited by management or self" on public.profiles for update to authenticated using (public.is_management() or id=auth.uid() or (public.current_role()='general_manager' and public.in_management_tree(id))) with check (public.is_management() or id=auth.uid() or (public.current_role()='general_manager' and public.in_management_tree(id)));
create policy "attendance own or hierarchy" on public.attendance for all to authenticated using (profile_id=auth.uid() or public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id))) with check (profile_id=auth.uid() or public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id)));
create policy "leave own or hierarchy" on public.leave_requests for all to authenticated using (profile_id=auth.uid() or public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id))) with check (profile_id=auth.uid() or public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id)));
create policy "tasks visible to assignee or management" on public.tasks for select to authenticated using (assignee_id=auth.uid() or public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(assignee_id)));
create policy "notifications are private" on public.notifications for all to authenticated using (profile_id=auth.uid()) with check (profile_id=auth.uid());

insert into public.departments(name) values ('Executive'),('Operations') on conflict(name) do nothing;
insert into public.roles(code,name) values ('chairman','Chairman'),('director','Director'),('general_manager','General Manager'),('staff','Staff') on conflict(code) do update set name=excluded.name;
