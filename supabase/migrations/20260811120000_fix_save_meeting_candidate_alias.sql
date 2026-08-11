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
  if exists (
    select 1
    from unnest(ids) as candidate(employee_id)
    left join public.profiles p on p.id=candidate.employee_id
    where p.id is null or not p.is_employee
  ) then raise exception 'Choose active employee invitees only.'; end if;
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

revoke all on function public.save_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,text,uuid[]) from public, anon;
grant execute on function public.save_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,text,uuid[]) to authenticated;
