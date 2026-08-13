-- Persisted foundation for the existing Google Form counselling feedback feed.
-- Source configuration and sync activity deliberately remain separate from responses.

create table if not exists public.counselling_feedback_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spreadsheet_id text not null,
  sheet_name text not null,
  column_map jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_successful_sync_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists counselling_feedback_sources_active_sheet_unique_idx
  on public.counselling_feedback_sources(spreadsheet_id, sheet_name)
  where is_active;

create table if not exists public.counselling_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.counselling_feedback_sources(id) on delete restrict,
  external_response_key text not null,
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  submitted_at timestamptz,
  customer_name text,
  psychologist_name_raw text,
  psychologist_profile_id uuid references public.profiles(id) on delete set null,
  match_status text not null default 'unmatched' check (match_status in ('matched', 'unmatched', 'ambiguous', 'ignored')),
  rating integer check (rating is null or rating between 1 and 5),
  message text,
  session_count integer check (session_count is null or session_count >= 0),
  service text,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint counselling_feedback_responses_source_response_unique unique (source_id, external_response_key),
  constraint counselling_feedback_responses_match_consistency check (
    (match_status = 'matched' and psychologist_profile_id is not null)
    or (match_status <> 'matched')
  )
);

create table if not exists public.counselling_feedback_staff_mappings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.counselling_feedback_sources(id) on delete cascade,
  sheet_email text,
  normalized_sheet_name text not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint counselling_feedback_staff_mappings_source_name_unique unique (source_id, normalized_sheet_name),
  constraint counselling_feedback_staff_mappings_verified check (verified_at is null or verified_by is not null)
);

create table if not exists public.counselling_feedback_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.counselling_feedback_sources(id) on delete restrict,
  direction text not null default 'sheet_to_crm' check (direction = 'sheet_to_crm'),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
  rows_seen integer not null default 0 check (rows_seen >= 0),
  rows_created integer not null default 0 check (rows_created >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_unmatched integer not null default 0 check (rows_unmatched >= 0),
  error_summary text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint counselling_feedback_sync_runs_completion_order check (completed_at is null or completed_at >= started_at)
);

create index if not exists counselling_feedback_responses_submitted_at_idx
  on public.counselling_feedback_responses(submitted_at desc);
create index if not exists counselling_feedback_responses_psychologist_idx
  on public.counselling_feedback_responses(psychologist_profile_id, submitted_at desc)
  where psychologist_profile_id is not null;
create index if not exists counselling_feedback_responses_psychologist_raw_idx
  on public.counselling_feedback_responses(psychologist_name_raw)
  where psychologist_name_raw is not null;
create index if not exists counselling_feedback_responses_match_status_idx
  on public.counselling_feedback_responses(match_status, submitted_at desc);
create index if not exists counselling_feedback_responses_rating_idx
  on public.counselling_feedback_responses(rating, submitted_at desc)
  where rating is not null;
create index if not exists counselling_feedback_responses_source_row_idx
  on public.counselling_feedback_responses(source_id, source_row_number)
  where source_row_number is not null;
create index if not exists counselling_feedback_sync_runs_source_started_idx
  on public.counselling_feedback_sync_runs(source_id, started_at desc);

drop trigger if exists counselling_feedback_sources_touch_updated_at on public.counselling_feedback_sources;
create trigger counselling_feedback_sources_touch_updated_at before update on public.counselling_feedback_sources
  for each row execute function public.touch_updated_at();
drop trigger if exists counselling_feedback_responses_touch_updated_at on public.counselling_feedback_responses;
create trigger counselling_feedback_responses_touch_updated_at before update on public.counselling_feedback_responses
  for each row execute function public.touch_updated_at();
drop trigger if exists counselling_feedback_staff_mappings_touch_updated_at on public.counselling_feedback_staff_mappings;
create trigger counselling_feedback_staff_mappings_touch_updated_at before update on public.counselling_feedback_staff_mappings
  for each row execute function public.touch_updated_at();

insert into public.permissions(code, description)
values ('counselling_feedback.manage', 'Configure counselling feedback sources, verified staff mappings, and sync history')
on conflict (code) do update set description = excluded.description;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = 'counselling_feedback.manage'
    where role.code = 'super_admin'
    on conflict do nothing;
  end if;
end $$;

alter table public.counselling_feedback_sources enable row level security;
alter table public.counselling_feedback_responses enable row level security;
alter table public.counselling_feedback_staff_mappings enable row level security;
alter table public.counselling_feedback_sync_runs enable row level security;

-- Table privileges complement RLS so psychologist-scoped clients cannot select raw payloads.
revoke all on table public.counselling_feedback_sources from anon, authenticated;
revoke all on table public.counselling_feedback_responses from anon, authenticated;
revoke all on table public.counselling_feedback_staff_mappings from anon, authenticated;
revoke all on table public.counselling_feedback_sync_runs from anon, authenticated;
grant select, insert, update, delete on public.counselling_feedback_sources to authenticated;
grant select (
  id, source_id, external_response_key, source_row_number, submitted_at, customer_name,
  psychologist_name_raw, psychologist_profile_id, match_status, rating, message,
  session_count, service, imported_at, created_at, updated_at
) on public.counselling_feedback_responses to authenticated;
grant select, insert, update, delete on public.counselling_feedback_staff_mappings to authenticated;
grant select on public.counselling_feedback_sync_runs to authenticated;

drop policy if exists "counselling feedback sources management only" on public.counselling_feedback_sources;
create policy "counselling feedback sources management only"
on public.counselling_feedback_sources for all to authenticated
using (public.has_permission('counselling_feedback.manage'))
with check (public.has_permission('counselling_feedback.manage'));

drop policy if exists "counselling feedback responses scoped view" on public.counselling_feedback_responses;
create policy "counselling feedback responses scoped view"
on public.counselling_feedback_responses for select to authenticated
using (
  public.is_super_admin()
  or public.has_permission('customer_feedback.view')
  or (public.current_role() = 'psychologist' and psychologist_profile_id = (select auth.uid()) and match_status = 'matched')
);

drop policy if exists "counselling feedback mappings management only" on public.counselling_feedback_staff_mappings;
create policy "counselling feedback mappings management only"
on public.counselling_feedback_staff_mappings for all to authenticated
using (public.has_permission('counselling_feedback.manage'))
with check (public.has_permission('counselling_feedback.manage'));

drop policy if exists "counselling feedback sync runs management only" on public.counselling_feedback_sync_runs;
create policy "counselling feedback sync runs management only"
on public.counselling_feedback_sync_runs for select to authenticated
using (public.has_permission('counselling_feedback.manage'));
