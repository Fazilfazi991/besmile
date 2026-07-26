-- Employee leave workflow.  This upgrades the original leave_requests table without losing existing records.
create table if not exists public.leave_types (
 id uuid primary key default gen_random_uuid(), code text not null unique check (code in ('annual','sick','casual','unpaid','emergency')),
 name text not null, default_days numeric(6,2), balance_required boolean not null default true, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.leave_types(code,name,default_days,balance_required) values
 ('annual','Annual Leave',21,true),('sick','Sick Leave',10,true),('casual','Casual Leave',7,true),('unpaid','Unpaid Leave',null,false),('emergency','Emergency Leave',3,true)
on conflict(code) do update set name=excluded.name, default_days=excluded.default_days, balance_required=excluded.balance_required;

create table if not exists public.employee_leave_balances (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade, leave_type_id uuid not null references public.leave_types(id) on delete restrict,
 leave_year integer not null check(leave_year between 2000 and 2200), allocated_days numeric(6,2) not null default 0 check(allocated_days>=0), used_days numeric(6,2) not null default 0 check(used_days>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(profile_id,leave_type_id,leave_year)
);
alter table public.leave_requests add column if not exists leave_type_id uuid references public.leave_types(id) on delete restrict, add column if not exists requested_days numeric(6,2), add column if not exists half_day boolean not null default false, add column if not exists approval_comment text, add column if not exists updated_at timestamptz not null default now(), add column if not exists cancelled_at timestamptz, add column if not exists withdrawn_at timestamptz;
alter table public.leave_requests alter column reason set not null;
alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests add constraint leave_requests_status_check check(status in ('pending','approved','rejected','cancelled','withdrawn'));
alter table public.leave_requests add constraint leave_requests_date_check check(starts_on<=ends_on);
create table if not exists public.leave_request_attachments (id uuid primary key default gen_random_uuid(), leave_request_id uuid not null references public.leave_requests(id) on delete cascade, storage_path text not null unique, file_name text not null, content_type text, created_at timestamptz not null default now());
create table if not exists public.leave_approval_events (id uuid primary key default gen_random_uuid(), leave_request_id uuid not null references public.leave_requests(id) on delete cascade, actor_id uuid references public.profiles(id) on delete set null, event_type text not null check(event_type in ('created','approved','rejected','cancelled','withdrawn')), comment text, created_at timestamptz not null default now());
create index if not exists leave_requests_profile_dates_idx on public.leave_requests(profile_id,starts_on,ends_on); create index if not exists leave_requests_status_idx on public.leave_requests(status); create index if not exists leave_balances_profile_year_idx on public.employee_leave_balances(profile_id,leave_year); create index if not exists leave_attachments_request_idx on public.leave_request_attachments(leave_request_id); create index if not exists leave_events_request_idx on public.leave_approval_events(leave_request_id,created_at);
drop trigger if exists leave_types_touch_updated_at on public.leave_types; create trigger leave_types_touch_updated_at before update on public.leave_types for each row execute function public.touch_updated_at();
drop trigger if exists leave_balances_touch_updated_at on public.employee_leave_balances; create trigger leave_balances_touch_updated_at before update on public.employee_leave_balances for each row execute function public.touch_updated_at();
drop trigger if exists leave_requests_touch_updated_at on public.leave_requests; create trigger leave_requests_touch_updated_at before update on public.leave_requests for each row execute function public.touch_updated_at();
create or replace function public.leave_employee_can_manage(requester uuid) returns boolean language sql stable security definer set search_path=public as $$ select requester=auth.uid() or public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(requester)) $$;
create or replace function public.enforce_leave_request_lifecycle() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='UPDATE' and old.profile_id=auth.uid() then
   if new.status not in ('cancelled','withdrawn') then raise exception 'Employees cannot approve or alter their own leave request'; end if;
   if new.status='withdrawn' and (old.status<>'approved' or old.starts_on<=current_date) then raise exception 'Only future approved leave can be withdrawn'; end if;
   if new.status='cancelled' and old.status<>'pending' then raise exception 'Only pending leave can be cancelled'; end if;
   if new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on or new.leave_type_id is distinct from old.leave_type_id or new.reason is distinct from old.reason then raise exception 'Leave request details cannot be changed when cancelling'; end if;
 end if;
 if TG_OP='UPDATE' and new.status in ('approved','rejected') and new.profile_id=auth.uid() then raise exception 'Employees cannot approve their own requests'; end if;
 return new;
end $$;
drop trigger if exists enforce_leave_request_lifecycle on public.leave_requests; create trigger enforce_leave_request_lifecycle before update on public.leave_requests for each row execute function public.enforce_leave_request_lifecycle();
alter table public.leave_types enable row level security; alter table public.employee_leave_balances enable row level security; alter table public.leave_request_attachments enable row level security; alter table public.leave_approval_events enable row level security;
drop policy if exists "leave types readable" on public.leave_types; create policy "leave types readable" on public.leave_types for select to authenticated using(is_active);
drop policy if exists "leave balances own or hierarchy" on public.employee_leave_balances; create policy "leave balances own or hierarchy" on public.employee_leave_balances for select to authenticated using(public.leave_employee_can_manage(profile_id));
drop policy if exists "leave balances management writes" on public.employee_leave_balances; create policy "leave balances management writes" on public.employee_leave_balances for all to authenticated using(public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id))) with check(public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id)));
drop policy if exists "leave own or hierarchy" on public.leave_requests;
create policy "leave read own or hierarchy" on public.leave_requests for select to authenticated using(public.leave_employee_can_manage(profile_id));
create policy "leave create own" on public.leave_requests for insert to authenticated with check(profile_id=auth.uid() and status='pending' and approver_id is null);
create policy "leave employee eligible updates" on public.leave_requests for update to authenticated using(profile_id=auth.uid() and status in ('pending','approved')) with check(profile_id=auth.uid() and status in ('cancelled','withdrawn'));
create policy "leave management updates" on public.leave_requests for update to authenticated using((public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id))) and profile_id<>auth.uid()) with check((public.is_management() or (public.current_role()='general_manager' and public.in_management_tree(profile_id))) and profile_id<>auth.uid());
drop policy if exists "leave attachments readable" on public.leave_request_attachments; create policy "leave attachments readable" on public.leave_request_attachments for select to authenticated using(exists(select 1 from public.leave_requests r where r.id=leave_request_id and public.leave_employee_can_manage(r.profile_id)));
drop policy if exists "leave attachments create own" on public.leave_request_attachments; create policy "leave attachments create own" on public.leave_request_attachments for insert to authenticated with check(exists(select 1 from public.leave_requests r where r.id=leave_request_id and r.profile_id=auth.uid() and r.status='pending'));
drop policy if exists "leave events readable" on public.leave_approval_events; create policy "leave events readable" on public.leave_approval_events for select to authenticated using(exists(select 1 from public.leave_requests r where r.id=leave_request_id and public.leave_employee_can_manage(r.profile_id)));
drop policy if exists "leave events management insert" on public.leave_approval_events; create policy "leave events management insert" on public.leave_approval_events for insert to authenticated with check(actor_id=auth.uid() and (public.is_management() or exists(select 1 from public.leave_requests r where r.id=leave_request_id and r.profile_id=auth.uid())));
insert into storage.buckets(id,name,public) values('leave-attachments','leave-attachments',false) on conflict(id) do nothing;
drop policy if exists "leave attachment upload" on storage.objects; create policy "leave attachment upload" on storage.objects for insert to authenticated with check(bucket_id='leave-attachments' and owner_id=auth.uid()::text);
drop policy if exists "leave attachment read" on storage.objects; create policy "leave attachment read" on storage.objects for select to authenticated using(bucket_id='leave-attachments' and owner_id=auth.uid()::text);
