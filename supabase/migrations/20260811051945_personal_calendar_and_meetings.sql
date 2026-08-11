-- Employee availability and internal meetings. All timestamps are stored as timestamptz;
-- clients construct them in the company business timezone (Asia/Kolkata).
create extension if not exists btree_gist;

insert into public.permissions(code, description) values
  ('meetings.view', 'View meetings you organize or are invited to'),
  ('meetings.create', 'Create internal meetings'),
  ('meetings.manage', 'Edit or cancel any internal meeting')
on conflict (code) do update set description = excluded.description;

create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at),
  check (title is null or char_length(trim(title)) <= 160)
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  agenda text not null default '' check (char_length(agenda) <= 500),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  meeting_type text not null default 'office' check (meeting_type in ('office','google_meet','microsoft_teams','zoom','other')),
  venue text,
  meeting_url text,
  description text,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at),
  check (meeting_url is null or meeting_url ~ '^https?://')
);

create table if not exists public.meeting_participants (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, employee_id)
);

create index if not exists calendar_blocks_employee_range_idx on public.calendar_blocks(employee_id, start_at, end_at);
create index if not exists meetings_organizer_range_idx on public.meetings(organizer_id, start_at) where status = 'scheduled';
create index if not exists meeting_participants_employee_idx on public.meeting_participants(employee_id, meeting_id);

alter table public.calendar_blocks enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
grant select, insert, update, delete on public.calendar_blocks, public.meetings, public.meeting_participants to authenticated;

create or replace function public.meeting_visible(target_meeting uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.meetings where id = target_meeting and organizer_id = auth.uid())
    or exists (select 1 from public.meeting_participants where meeting_id = target_meeting and employee_id = auth.uid())
    or public.has_permission('meetings.manage')
  )
$$;

create policy "calendar blocks own" on public.calendar_blocks for select to authenticated using (employee_id = (select auth.uid()) or public.has_permission('meetings.manage'));
create policy "calendar blocks own write" on public.calendar_blocks for all to authenticated using (employee_id = (select auth.uid()) or public.has_permission('meetings.manage')) with check (employee_id = (select auth.uid()) or public.has_permission('meetings.manage'));
create policy "meetings visible to participants" on public.meetings for select to authenticated using (public.meeting_visible(id));
create policy "meeting participants visible" on public.meeting_participants for select to authenticated using (public.meeting_visible(meeting_id));

create or replace function public.meeting_conflicts(
  proposed_start timestamptz,
  proposed_end timestamptz,
  participant_ids uuid[],
  ignored_meeting uuid default null
) returns table(employee_id uuid, conflict_kind text, conflict_title text, conflict_start timestamptz, conflict_end timestamptz)
language sql stable security definer set search_path = public as $$
  with requested as (select distinct unnest(coalesce(participant_ids, '{}'::uuid[])) as employee_id), conflicts as (
    select b.employee_id, 'blocked'::text, coalesce(nullif(b.title,''),'Unavailable'), b.start_at, b.end_at
    from public.calendar_blocks b join requested r using (employee_id)
    where tstzrange(b.start_at,b.end_at,'[)') && tstzrange(proposed_start,proposed_end,'[)')
    union all
    select p.employee_id, 'meeting'::text, m.title, m.start_at, m.end_at
    from public.meeting_participants p join public.meetings m on m.id=p.meeting_id join requested r on r.employee_id=p.employee_id
    where m.status='scheduled' and (ignored_meeting is null or m.id <> ignored_meeting)
      and tstzrange(m.start_at,m.end_at,'[)') && tstzrange(proposed_start,proposed_end,'[)')
  ) select * from conflicts
$$;

create or replace function public.save_meeting(
  target_meeting uuid,
  meeting_title text, meeting_agenda text, meeting_start timestamptz, meeting_end timestamptz,
  meeting_type_value text, meeting_venue text, meeting_url_value text, meeting_description text,
  participant_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; ids uuid[]; conflicts jsonb;
begin
  if auth.uid() is null or not (public.has_permission('meetings.create') or public.has_permission('meetings.manage')) then raise exception 'Permission denied for meeting creation' using errcode='42501'; end if;
  if meeting_start >= meeting_end then raise exception 'Meeting end time must be after start time.'; end if;
  if meeting_type_value not in ('office','google_meet','microsoft_teams','zoom','other') then raise exception 'Choose a valid meeting type.'; end if;
  if target_meeting is not null and not exists (select 1 from public.meetings where id=target_meeting and (organizer_id=auth.uid() or public.has_permission('meetings.manage'))) then raise exception 'Permission denied for meeting update' using errcode='42501'; end if;
  ids := array(select distinct value from unnest(array_append(coalesce(participant_ids,'{}'::uuid[]), auth.uid())) value);
  if exists (select 1 from unnest(ids) as candidate(employee_id) left join public.profiles p on p.id=candidate.employee_id where p.id is null or not p.is_employee) then raise exception 'Choose active employee invitees only.'; end if;
  select jsonb_agg(jsonb_build_object('employee_id',employee_id,'kind',conflict_kind,'title',conflict_title,'start_at',conflict_start,'end_at',conflict_end)) into conflicts from public.meeting_conflicts(meeting_start,meeting_end,ids,target_meeting);
  if conflicts is not null then raise exception 'Selected invitees are unavailable: %', conflicts using errcode='23P01'; end if;
  if target_meeting is null then
    insert into public.meetings(title,agenda,organizer_id,start_at,end_at,meeting_type,venue,meeting_url,description) values (trim(meeting_title),coalesce(meeting_agenda,''),auth.uid(),meeting_start,meeting_end,meeting_type_value,nullif(trim(meeting_venue),''),nullif(trim(meeting_url_value),''),nullif(trim(meeting_description),'')) returning id into result_id;
  else
    update public.meetings set title=trim(meeting_title),agenda=coalesce(meeting_agenda,''),start_at=meeting_start,end_at=meeting_end,meeting_type=meeting_type_value,venue=nullif(trim(meeting_venue),''),meeting_url=nullif(trim(meeting_url_value),''),description=nullif(trim(meeting_description),''),updated_at=now() where id=target_meeting returning id into result_id;
    delete from public.meeting_participants where meeting_id=result_id;
  end if;
  insert into public.meeting_participants(meeting_id,employee_id) select result_id, unnest(ids);
  return result_id;
end $$;

create or replace function public.cancel_meeting(target_meeting uuid) returns uuid language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.meetings where id=target_meeting and (organizer_id=auth.uid() or public.has_permission('meetings.manage'))) then raise exception 'Permission denied for meeting cancellation' using errcode='42501'; end if;
  update public.meetings set status='cancelled',cancelled_at=now(),updated_at=now() where id=target_meeting;
  return target_meeting;
end $$;

revoke all on function public.meeting_visible(uuid), public.meeting_conflicts(timestamptz,timestamptz,uuid[],uuid), public.save_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,text,uuid[]), public.cancel_meeting(uuid) from public, anon;
grant execute on function public.meeting_conflicts(timestamptz,timestamptz,uuid[],uuid), public.save_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,text,uuid[]), public.cancel_meeting(uuid) to authenticated;
