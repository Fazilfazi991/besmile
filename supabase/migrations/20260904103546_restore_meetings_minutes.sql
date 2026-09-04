-- Phase 8E additive recovery of verified active Production contracts.
-- Source behavior recovered from reachable historical migrations; no data rows are copied.

-- Recovered from supabase/migrations/20260814071316_meetings_and_minutes.sql
-- Batch 7: extend the existing internal meeting/calendar feature with approved
-- hosts, structured minutes, private MoM history, and an idempotent reminder.

insert into public.permissions(code, description) values
  ('meetings.host', 'Host internal meetings'),
  ('meetings.notes', 'Edit meeting notes and generate minutes')
on conflict(code) do update set description = excluded.description;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role cross join public.permissions permission
    where role.code in ('director','general_manager')
      and permission.code in ('meetings.view','meetings.create','meetings.host','meetings.manage','meetings.notes')
    on conflict do nothing;

    delete from public.role_permissions role_permission
    using public.roles role, public.permissions permission
    where role_permission.role_id=role.id and role_permission.permission_id=permission.id
      and role.code='chairman' and permission.code in ('meetings.create','meetings.host');
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role') then
    insert into public.role_permissions(role, permission_id)
    select role_name::public.employee_role, permission.id
    from (values ('Director'),('General Manager')) approved(role_name)
    cross join public.permissions permission
    where permission.code in ('meetings.view','meetings.create','meetings.host','meetings.manage','meetings.notes')
    on conflict do nothing;

    delete from public.role_permissions role_permission
    using public.permissions permission
    where role_permission.permission_id=permission.id
      and role_permission.role::text='Chairman' and permission.code in ('meetings.create','meetings.host');
  end if;
end $$;

-- Diya's canonical production profile, established by the approved identity
-- cleanup migration. This is intentionally a UUID grant, never a name check.
insert into public.user_permission_grants(profile_id, permission_id, granted_by, reason)
select diya.id, permission.id, coalesce(gm.id,diya.id), 'Approved Batch 7 meeting creator and host'
from public.profiles diya
cross join public.permissions permission
left join public.profiles gm on gm.id='e64c5750-b585-4cab-9478-2c1fbad3b26e'::uuid
where diya.id='ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid
  and permission.code in ('meetings.view','meetings.create','meetings.host','meetings.notes')
  and not exists (
    select 1 from public.user_permission_grants existing
    where existing.profile_id=diya.id and existing.permission_id=permission.id
      and existing.revoked_at is null and existing.starts_at<=now()
      and (existing.expires_at is null or existing.expires_at>now())
  );

alter table public.meetings
  add column if not exists host_user_id uuid references public.profiles(id) on delete restrict,
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists notes_reminder_sent_at timestamptz,
  add column if not exists mom_current_document_id uuid references public.documents(id) on delete set null;

update public.meetings set host_user_id=organizer_id where host_user_id is null;
update public.meetings
set cancelled_by=coalesce(cancelled_by,organizer_id),
    cancellation_reason=coalesce(nullif(btrim(cancellation_reason),''),'Cancelled before Batch 7')
where status='cancelled';
update public.meetings
set cancelled_at=null,cancelled_by=null,cancellation_reason=null
where status='scheduled';
alter table public.meetings alter column host_user_id set not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='meetings_timezone_check' and conrelid='public.meetings'::regclass) then
    alter table public.meetings add constraint meetings_timezone_check check(timezone='Asia/Kolkata');
  end if;
  if not exists(select 1 from pg_constraint where conname='meetings_cancellation_state_check' and conrelid='public.meetings'::regclass) then
    alter table public.meetings add constraint meetings_cancellation_state_check check(
      (status='cancelled' and cancelled_at is not null and cancelled_by is not null and length(btrim(cancellation_reason))>=3)
      or (status='scheduled' and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    );
  end if;
end $$;

alter table public.meeting_participants
  add column if not exists invited_at timestamptz not null default now(),
  add column if not exists invited_by uuid references public.profiles(id) on delete set null;

create table public.meeting_notes (
  meeting_id uuid primary key references public.meetings(id) on delete restrict,
  discussion_summary text not null default '' check(length(discussion_summary)<=30000),
  additional_notes text not null default '' check(length(additional_notes)<=30000),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  decision_text text not null check(length(btrim(decision_text)) between 2 and 2000),
  position integer not null check(position between 0 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(meeting_id, position)
);

create table public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  action_text text not null check(length(btrim(action_text)) between 2 and 500),
  responsible_user_id uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'pending' check(status in ('pending','completed')),
  position integer not null check(position between 0 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(meeting_id, position)
);

alter table public.documents add column if not exists meeting_id uuid references public.meetings(id) on delete set null;

create table public.meeting_mom_versions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  document_id uuid not null unique references public.documents(id) on delete restrict,
  version_number integer not null check(version_number>0),
  notes_updated_at timestamptz not null,
  generated_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamptz not null default now(),
  unique(meeting_id, version_number)
);

create table public.meeting_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index meetings_host_range_idx on public.meetings(host_user_id,start_at) where status='scheduled';
create index meetings_notes_reminder_due_idx on public.meetings(end_at) where status='scheduled' and notes_reminder_sent_at is null;
create index meeting_participants_meeting_employee_idx on public.meeting_participants(meeting_id,employee_id);
create index meeting_decisions_meeting_position_idx on public.meeting_decisions(meeting_id,position);
create index meeting_action_items_meeting_position_idx on public.meeting_action_items(meeting_id,position);
create index meeting_action_items_owner_due_idx on public.meeting_action_items(responsible_user_id,due_date) where responsible_user_id is not null and status='pending';
create index meeting_mom_versions_meeting_version_idx on public.meeting_mom_versions(meeting_id,version_number desc);
create index meeting_events_meeting_created_idx on public.meeting_events(meeting_id,created_at desc);
create index documents_meeting_created_idx on public.documents(meeting_id,created_at desc) where meeting_id is not null;

drop trigger if exists meeting_notes_touch_updated_at on public.meeting_notes;
create trigger meeting_notes_touch_updated_at before update on public.meeting_notes for each row execute function public.touch_updated_at();
drop trigger if exists meeting_action_items_touch_updated_at on public.meeting_action_items;
create trigger meeting_action_items_touch_updated_at before update on public.meeting_action_items for each row execute function public.touch_updated_at();

create or replace function public.meeting_host_allowed(candidate uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles profile
    where profile.id=candidate and profile.status='active' and profile.is_employee and profile.workforce_visible
      and public.has_permission('meetings.host',profile.id)
      and (profile.role::text in ('director','general_manager') or profile.id='ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid)
  )
$$;

revoke execute on function public.meeting_host_allowed(uuid) from public,anon,authenticated;

create or replace function public.meeting_visible(target_meeting uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    public.has_permission('meetings.manage')
    or exists(select 1 from public.meetings meeting where meeting.id=target_meeting and meeting.organizer_id=(select auth.uid()))
    or exists(select 1 from public.meetings meeting where meeting.id=target_meeting and meeting.host_user_id=(select auth.uid()))
    or exists(select 1 from public.meeting_participants participant where participant.meeting_id=target_meeting and participant.employee_id=(select auth.uid()))
  )
$$;

create or replace function public.meeting_notes_editable(target_meeting uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.meetings meeting
    where meeting.id=target_meeting and meeting.status='scheduled' and meeting.end_at<=now() and (
      public.has_permission('meetings.manage')
      or (meeting.host_user_id=(select auth.uid()) and public.has_permission('meetings.notes'))
    )
  )
$$;

create or replace function public.meeting_deep_link(target_profile uuid,target_meeting uuid,target_anchor text default '')
returns text language sql stable security definer set search_path='' as $$
  select case when profile.role::text in ('super_admin','chairman','director','general_manager') then '/admin/meetings/' else '/employee/meetings/' end
    || target_meeting::text || coalesce(target_anchor,'')
  from public.profiles profile where profile.id=target_profile
$$;

create or replace function public.meeting_hosts()
returns table(id uuid,full_name text,designation text,role text)
language sql stable security definer set search_path='' as $$
  select profile.id,profile.full_name,profile.designation,profile.role::text
  from public.profiles profile
  where (select auth.uid()) is not null
    and (public.has_permission('meetings.create') or public.has_permission('meetings.manage'))
    and public.meeting_host_allowed(profile.id)
  order by case profile.role::text when 'director' then 1 when 'general_manager' then 2 else 3 end,profile.full_name
$$;

-- Replace the original availability RPC because it exposed private calendar
-- and meeting titles. Creators/managers need only opaque busy ranges.
drop function if exists public.meeting_conflicts(timestamptz,timestamptz,uuid[],uuid);
create function public.meeting_conflicts(
  proposed_start timestamptz,proposed_end timestamptz,participant_ids uuid[],ignored_meeting uuid default null
) returns table(employee_id uuid,conflict_kind text,conflict_start timestamptz,conflict_end timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not (public.has_permission('meetings.create') or public.has_permission('meetings.manage')) then
    raise exception 'Permission denied for meeting availability' using errcode='42501';
  end if;
  return query
  with requested as (select distinct unnest(coalesce(participant_ids,'{}'::uuid[])) as employee_id)
  select block.employee_id,'blocked'::text,block.start_at,block.end_at
  from public.calendar_blocks block join requested using(employee_id)
  where tstzrange(block.start_at,block.end_at,'[)') && tstzrange(proposed_start,proposed_end,'[)')
  union all
  select participant.employee_id,'meeting'::text,meeting.start_at,meeting.end_at
  from public.meeting_participants participant
  join public.meetings meeting on meeting.id=participant.meeting_id
  join requested on requested.employee_id=participant.employee_id
  where meeting.status='scheduled' and (ignored_meeting is null or meeting.id<>ignored_meeting)
    and tstzrange(meeting.start_at,meeting.end_at,'[)') && tstzrange(proposed_start,proposed_end,'[)');
end $$;

create or replace function public.meeting_workforce()
returns table(id uuid,full_name text,designation text,department_name text)
language sql stable security definer set search_path='' as $$
  select profile.id,profile.full_name,profile.designation,department.name
  from public.profiles profile left join public.departments department on department.id=profile.department_id
  where (select auth.uid()) is not null and public.has_permission('meetings.view')
    and profile.is_employee and profile.workforce_visible and profile.status in ('active','intern','probation')
  order by profile.full_name
$$;

drop function if exists public.save_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,text,uuid[]);
create function public.save_meeting(
  target_meeting uuid,meeting_title text,meeting_agenda text,meeting_start timestamptz,meeting_end timestamptz,
  meeting_type_value text,meeting_venue text,meeting_url_value text,meeting_description text,
  host_profile_id uuid,participant_ids uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  result_id uuid; ids uuid[]; previous public.meetings%rowtype; old_ids uuid[]:='{}'::uuid[];
  recipient uuid; host_name text; important_change boolean:=false; actor uuid:=(select auth.uid());
begin
  if actor is null then raise exception 'Permission denied' using errcode='42501'; end if;
  if target_meeting is null and not public.has_permission('meetings.create') then raise exception 'Permission denied for meeting creation' using errcode='42501'; end if;
  if meeting_start is null or meeting_end is null or meeting_start>=meeting_end then raise exception 'Meeting end time must be after start time.'; end if;
  if meeting_end-meeting_start>interval '12 hours' then raise exception 'Meeting duration cannot exceed 12 hours.'; end if;
  if length(btrim(coalesce(meeting_title,'')))<2 or length(btrim(coalesce(meeting_agenda,'')))<2 then raise exception 'Meeting title and agenda are required.'; end if;
  if meeting_type_value not in ('office','google_meet','microsoft_teams','zoom','other') then raise exception 'Choose a valid meeting type.'; end if;
  if not public.meeting_host_allowed(host_profile_id) then raise exception 'The selected employee is not an approved meeting host.' using errcode='42501'; end if;
  if target_meeting is not null then
    select * into previous from public.meetings where id=target_meeting for update;
    if not found or previous.status='cancelled' or not (previous.organizer_id=actor or previous.host_user_id=actor or public.has_permission('meetings.manage')) then raise exception 'Permission denied for meeting update' using errcode='42501'; end if;
    select coalesce(array_agg(employee_id order by employee_id),'{}'::uuid[]) into old_ids from public.meeting_participants where meeting_id=target_meeting;
  end if;
  ids:=array(select distinct value from unnest(array_append(array_append(coalesce(participant_ids,'{}'::uuid[]),host_profile_id),actor)) value order by value);
  if exists(select 1 from unnest(ids) candidate(employee_id) left join public.profiles profile on profile.id=candidate.employee_id where profile.id is null or not profile.is_employee or not profile.workforce_visible or profile.status not in ('active','intern','probation')) then raise exception 'Choose active workforce participants only.'; end if;
  select full_name into host_name from public.profiles where id=host_profile_id;
  if target_meeting is null then
    insert into public.meetings(title,agenda,organizer_id,host_user_id,start_at,end_at,timezone,meeting_type,venue,meeting_url,description)
    values(btrim(meeting_title),btrim(meeting_agenda),actor,host_profile_id,meeting_start,meeting_end,'Asia/Kolkata',meeting_type_value,nullif(btrim(meeting_venue),''),nullif(btrim(meeting_url_value),''),nullif(btrim(meeting_description),'')) returning id into result_id;
  else
    important_change:=previous.title is distinct from btrim(meeting_title) or previous.host_user_id is distinct from host_profile_id or previous.start_at is distinct from meeting_start or previous.end_at is distinct from meeting_end or previous.meeting_type is distinct from meeting_type_value or previous.venue is distinct from nullif(btrim(meeting_venue),'') or previous.meeting_url is distinct from nullif(btrim(meeting_url_value),'');
    update public.meetings set title=btrim(meeting_title),agenda=btrim(meeting_agenda),host_user_id=host_profile_id,start_at=meeting_start,end_at=meeting_end,meeting_type=meeting_type_value,venue=nullif(btrim(meeting_venue),''),meeting_url=nullif(btrim(meeting_url_value),''),description=nullif(btrim(meeting_description),''),updated_at=now() where id=target_meeting returning id into result_id;
    delete from public.meeting_participants where meeting_id=result_id;
  end if;
  insert into public.meeting_participants(meeting_id,employee_id,invited_by) select result_id,unnest(ids),actor;
  if target_meeting is null then
    for recipient in select unnest(ids) loop
      perform public.notify_user(recipient,'New Meeting Scheduled',btrim(meeting_title)||' - '||to_char(meeting_start at time zone 'Asia/Kolkata','DD Mon YYYY, HH12:MI AM')||' - Host: '||host_name,'meeting_scheduled',result_id,public.meeting_deep_link(recipient,result_id),actor,'meetings','high','standard',true);
    end loop;
    insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(result_id,'meeting_created',actor,jsonb_build_object('host_user_id',host_profile_id,'participant_count',cardinality(ids)));
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'meeting_created','meetings',result_id,jsonb_build_object('host_user_id',host_profile_id,'start_at',meeting_start,'end_at',meeting_end,'participant_count',cardinality(ids)));
  else
    if important_change or old_ids is distinct from ids then
      for recipient in select distinct value from unnest(old_ids||ids) value loop
        perform public.notify_user(recipient,'Meeting Updated',btrim(meeting_title)||' - '||to_char(meeting_start at time zone 'Asia/Kolkata','DD Mon YYYY, HH12:MI AM')||' - Host: '||host_name,'meeting_updated',result_id,public.meeting_deep_link(recipient,result_id),actor,'meetings','high','standard',true);
      end loop;
    end if;
    insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(result_id,'meeting_updated',actor,jsonb_build_object('host_user_id',host_profile_id,'participant_count',cardinality(ids),'important_change',important_change));
    if previous.host_user_id is distinct from host_profile_id then insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(result_id,'meeting_host_changed',actor,jsonb_build_object('previous_host_user_id',previous.host_user_id,'host_user_id',host_profile_id)); end if;
    if old_ids is distinct from ids then insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(result_id,'meeting_participants_changed',actor,jsonb_build_object('previous_count',cardinality(old_ids),'participant_count',cardinality(ids))); end if;
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(actor,'meeting_updated','meetings',result_id,jsonb_build_object('host_user_id',previous.host_user_id,'start_at',previous.start_at,'end_at',previous.end_at,'participant_count',cardinality(old_ids)),jsonb_build_object('host_user_id',host_profile_id,'start_at',meeting_start,'end_at',meeting_end,'participant_count',cardinality(ids)));
  end if;
  return result_id;
end $$;

drop function if exists public.cancel_meeting(uuid);
create function public.cancel_meeting(target_meeting uuid,cancel_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.meetings%rowtype; recipient uuid; actor uuid:=(select auth.uid());
begin
  if length(btrim(coalesce(cancel_reason,'')))<3 then raise exception 'A cancellation reason is required.'; end if;
  select * into item from public.meetings where id=target_meeting for update;
  if not found or item.status='cancelled' or not (item.organizer_id=actor or item.host_user_id=actor or public.has_permission('meetings.manage')) then raise exception 'Permission denied for meeting cancellation' using errcode='42501'; end if;
  update public.meetings set status='cancelled',cancelled_at=now(),cancelled_by=actor,cancellation_reason=btrim(cancel_reason),updated_at=now() where id=target_meeting;
  for recipient in select employee_id from public.meeting_participants where meeting_id=target_meeting loop
    perform public.notify_user(recipient,'Meeting Cancelled',item.title||' was cancelled.','meeting_cancelled',item.id,public.meeting_deep_link(recipient,item.id),actor,'meetings','high','warning',true);
  end loop;
  insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(item.id,'meeting_cancelled',actor,jsonb_build_object('reason',btrim(cancel_reason)));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'meeting_cancelled','meetings',item.id,jsonb_build_object('reason',btrim(cancel_reason)));
  return item.id;
end $$;

create or replace function public.save_meeting_minutes(target_meeting uuid,discussion text,additional text,decisions jsonb,action_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.meetings%rowtype; actor uuid:=(select auth.uid()); entry jsonb; position_value integer:=0;
begin
  select * into item from public.meetings where id=target_meeting for update;
  if not found or item.status='cancelled' or item.end_at>now() or not public.meeting_notes_editable(target_meeting) then raise exception 'Meeting notes are available to the host after the meeting ends.' using errcode='42501'; end if;
  if length(btrim(coalesce(discussion,'')))<2 and jsonb_array_length(coalesce(decisions,'[]'::jsonb))=0 and jsonb_array_length(coalesce(action_items,'[]'::jsonb))=0 then raise exception 'Add discussion, a decision, or an action item.'; end if;
  insert into public.meeting_notes(meeting_id,discussion_summary,additional_notes,updated_by) values(target_meeting,btrim(coalesce(discussion,'')),btrim(coalesce(additional,'')),actor)
  on conflict(meeting_id) do update set discussion_summary=excluded.discussion_summary,additional_notes=excluded.additional_notes,updated_by=actor,updated_at=now();
  delete from public.meeting_decisions where meeting_id=target_meeting;
  for entry in select value from jsonb_array_elements(coalesce(decisions,'[]'::jsonb)) loop
    if length(btrim(coalesce(entry->>'text','')))<2 then raise exception 'Decision text is required.'; end if;
    insert into public.meeting_decisions(meeting_id,decision_text,position,created_by) values(target_meeting,btrim(entry->>'text'),position_value,actor); position_value:=position_value+1;
  end loop;
  delete from public.meeting_action_items where meeting_id=target_meeting; position_value:=0;
  for entry in select value from jsonb_array_elements(coalesce(action_items,'[]'::jsonb)) loop
    if length(btrim(coalesce(entry->>'action','')))<2 then raise exception 'Action item text is required.'; end if;
    if coalesce(entry->>'owner_id','')<>'' and not exists(select 1 from public.meeting_participants where meeting_id=target_meeting and employee_id=(entry->>'owner_id')::uuid) then raise exception 'Action owners must be meeting participants.'; end if;
    insert into public.meeting_action_items(meeting_id,action_text,responsible_user_id,due_date,status,position,created_by)
    values(target_meeting,btrim(entry->>'action'),nullif(entry->>'owner_id','')::uuid,nullif(entry->>'due_date','')::date,case when entry->>'status'='completed' then 'completed' else 'pending' end,position_value,actor); position_value:=position_value+1;
  end loop;
  insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(target_meeting,'meeting_notes_saved',actor,jsonb_build_object('decisions',jsonb_array_length(coalesce(decisions,'[]'::jsonb)),'action_items',jsonb_array_length(coalesce(action_items,'[]'::jsonb))));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,'meeting_notes_saved','meetings',target_meeting,jsonb_build_object('decisions',jsonb_array_length(coalesce(decisions,'[]'::jsonb)),'action_items',jsonb_array_length(coalesce(action_items,'[]'::jsonb))));
  return target_meeting;
end $$;

create or replace function public.record_meeting_mom(target_meeting uuid,target_document uuid)
returns public.meeting_mom_versions language plpgsql security definer set search_path='' as $$
declare item public.meetings%rowtype; note public.meeting_notes%rowtype; result public.meeting_mom_versions%rowtype; next_version integer; actor uuid:=(select auth.uid());
begin
  select * into item from public.meetings where id=target_meeting for update;
  select * into note from public.meeting_notes where meeting_id=target_meeting;
  if not found or not public.meeting_notes_editable(target_meeting) then raise exception 'Saved meeting notes are required.' using errcode='42501'; end if;
  if not exists(select 1 from public.documents where id=target_document and meeting_id=target_meeting and source_type='official_generated' and document_type='minutes_of_meeting') then raise exception 'The MoM document does not belong to this meeting.'; end if;
  select coalesce(max(version_number),0)+1 into next_version from public.meeting_mom_versions where meeting_id=target_meeting;
  insert into public.meeting_mom_versions(meeting_id,document_id,version_number,notes_updated_at,generated_by) values(target_meeting,target_document,next_version,note.updated_at,actor) returning * into result;
  update public.meetings set mom_current_document_id=target_document,updated_at=now() where id=target_meeting;
  insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(target_meeting,case when next_version=1 then 'mom_generated' else 'mom_regenerated' end,actor,jsonb_build_object('document_id',target_document,'version',next_version));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(actor,case when next_version=1 then 'meeting_mom_generated' else 'meeting_mom_regenerated' end,'meetings',target_meeting,jsonb_build_object('document_id',target_document,'version',next_version));
  return result;
end $$;

create or replace function public.record_meeting_mom_download(target_meeting uuid,target_document uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.meeting_visible(target_meeting) or not exists(select 1 from public.meeting_mom_versions where meeting_id=target_meeting and document_id=target_document) then raise exception 'Document unavailable' using errcode='42501'; end if;
  insert into public.meeting_events(meeting_id,event_type,actor_id,details) values(target_meeting,'mom_downloaded',(select auth.uid()),jsonb_build_object('document_id',target_document));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values((select auth.uid()),'meeting_mom_downloaded','meetings',target_meeting,jsonb_build_object('document_id',target_document));
end $$;

create or replace function public.process_meeting_notes_reminders()
returns integer language plpgsql security definer set search_path='' as $$
declare item record; processed integer:=0;
begin
  for item in
    select meeting.id,meeting.title,meeting.host_user_id
    from public.meetings meeting
    where meeting.status='scheduled' and meeting.end_at<=now() and meeting.notes_reminder_sent_at is null
    order by meeting.end_at for update skip locked
  loop
    update public.meetings set notes_reminder_sent_at=now(),updated_at=now() where id=item.id and notes_reminder_sent_at is null;
    if found then
      perform public.notify_user(item.host_user_id,'Meeting completed - notes required',item.title||' has ended. Please add the meeting notes and Minutes of Meeting.','meeting_notes_required',item.id,public.meeting_deep_link(item.host_user_id,item.id,'#notes'),null,'meetings','high','standard',true);
      insert into public.meeting_events(meeting_id,event_type,details) values(item.id,'notes_reminder_sent',jsonb_build_object('host_user_id',item.host_user_id));
      insert into public.audit_logs(action,entity_type,entity_id,after_data) values('meeting_notes_reminder_sent','meetings',item.id,jsonb_build_object('host_user_id',item.host_user_id));
      processed:=processed+1;
    end if;
  end loop;
  return processed;
end $$;

alter table public.meeting_notes enable row level security;
alter table public.meeting_decisions enable row level security;
alter table public.meeting_action_items enable row level security;
alter table public.meeting_mom_versions enable row level security;
alter table public.meeting_events enable row level security;

create policy "meeting notes member read" on public.meeting_notes for select to authenticated using(public.meeting_visible(meeting_id));
create policy "meeting decisions member read" on public.meeting_decisions for select to authenticated using(public.meeting_visible(meeting_id));
create policy "meeting action items member read" on public.meeting_action_items for select to authenticated using(public.meeting_visible(meeting_id));
create policy "meeting mom history member read" on public.meeting_mom_versions for select to authenticated using(public.meeting_visible(meeting_id));
create policy "meeting events member read" on public.meeting_events for select to authenticated using(public.meeting_visible(meeting_id));
create policy "meeting documents member read" on public.documents for select to authenticated using(meeting_id is not null and public.meeting_visible(meeting_id));
create policy "meeting documents host create" on public.documents for insert to authenticated with check(meeting_id is not null and uploaded_by=(select auth.uid()) and public.meeting_notes_editable(meeting_id));

grant select on public.meeting_notes,public.meeting_decisions,public.meeting_action_items,public.meeting_mom_versions,public.meeting_events to authenticated;
revoke insert,update,delete on public.meeting_notes,public.meeting_decisions,public.meeting_action_items,public.meeting_mom_versions,public.meeting_events from authenticated;

create policy "meeting mom uploads" on storage.objects for insert to authenticated with check(
  bucket_id='employee-documents' and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]='company' and (storage.foldername(name))[2]=(select auth.uid())::text and (storage.foldername(name))[3]='meetings'
  and lower(coalesce(storage.extension(name),''))='pdf'
  and (public.has_permission('meetings.notes') or public.has_permission('meetings.manage'))
);
create policy "meeting mom downloads" on storage.objects for select to authenticated using(
  bucket_id='employee-documents' and exists(select 1 from public.documents document where document.storage_path=name and document.meeting_id is not null and public.meeting_visible(document.meeting_id))
);

revoke execute on function public.meeting_host_allowed(uuid),public.meeting_notes_editable(uuid),public.meeting_deep_link(uuid,uuid,text),public.process_meeting_notes_reminders() from public,anon,authenticated;
revoke execute on function public.meeting_visible(uuid),public.meeting_hosts(),public.meeting_workforce(),public.meeting_conflicts(timestamptz,timestamptz,uuid[],uuid),public.save_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,text,uuid,uuid[]),public.cancel_meeting(uuid,text),public.save_meeting_minutes(uuid,text,text,jsonb,jsonb),public.record_meeting_mom(uuid,uuid),public.record_meeting_mom_download(uuid,uuid) from public,anon;
grant execute on function public.meeting_visible(uuid),public.meeting_hosts(),public.meeting_workforce(),public.meeting_conflicts(timestamptz,timestamptz,uuid[],uuid),public.save_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,text,uuid,uuid[]),public.cancel_meeting(uuid,text),public.save_meeting_minutes(uuid,text,text,jsonb,jsonb),public.record_meeting_mom(uuid,uuid),public.record_meeting_mom_download(uuid,uuid) to authenticated;
grant execute on function public.process_meeting_notes_reminders() to service_role;

-- Supabase Cron is the existing database scheduler. The named schedule is
-- idempotently replaced and runs entirely server-side every five minutes.
create extension if not exists pg_cron;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='meeting-notes-reminders';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('meeting-notes-reminders','*/5 * * * *','select public.process_meeting_notes_reminders();');
end $$;

-- Recovered from supabase/migrations/20260814153000_batch_7_remove_named_meeting_exception.sql
-- Batch 7 follow-up: replace the historical named-person exception with the
-- canonical role-and-effective-permission model.  This is intentionally
-- forward-only; the original migration remains an immutable deployment record.

update public.user_permission_grants grant_row
set revoked_at = coalesce(grant_row.revoked_at, now())
from public.permissions permission
where grant_row.profile_id = 'ccb736c8-de18-4dec-9b18-cda4c3fdd1b5'::uuid
  and grant_row.permission_id = permission.id
  and permission.code in ('meetings.view', 'meetings.create', 'meetings.host', 'meetings.notes')
  and grant_row.revoked_at is null;

create or replace function public.meeting_host_allowed(candidate uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.profiles profile
    where profile.id = candidate
      and profile.status = 'active'
      and profile.is_employee
      and profile.workforce_visible
      and public.has_permission('meetings.host', profile.id)
      and profile.role::text in ('director', 'general_manager')
  )
$$;

revoke execute on function public.meeting_host_allowed(uuid) from public,anon,authenticated;
