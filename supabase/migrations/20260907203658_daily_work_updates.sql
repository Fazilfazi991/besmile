create table public.daily_work_updates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  summary text not null check (char_length(btrim(summary)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, work_date)
);

alter table public.daily_work_updates enable row level security;

create policy "daily work updates readable by owner or workforce managers"
on public.daily_work_updates for select to authenticated
using (
  profile_id = (select auth.uid())
  or public.has_permission('attendance.manage')
  or (public.has_permission('attendance.view') and public.in_management_tree(profile_id))
);

create policy "daily work updates created by owner"
on public.daily_work_updates for insert to authenticated
with check (profile_id = (select auth.uid()));

create policy "daily work updates edited by owner"
on public.daily_work_updates for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

grant select, insert, update on public.daily_work_updates to authenticated;
revoke all on public.daily_work_updates from anon;
