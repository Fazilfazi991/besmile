-- A participant may read a shared note while profiles RLS hides another
-- employee's profile. Return only the note author's display name, and only
-- when the caller can already see the target meeting.
create or replace function public.meeting_note_entries_for_visible_meeting(target_meeting uuid)
returns table (
  id uuid,
  meeting_id uuid,
  content text,
  created_at timestamptz,
  author jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select note.id, note.meeting_id, note.content, note.created_at,
    jsonb_build_object('full_name', coalesce(nullif(btrim(profile.full_name), ''), 'Meeting participant'))
  from public.meeting_note_entries note
  join public.profiles profile on profile.id = note.author_profile_id
  where target_meeting is not null
    and (select auth.uid()) is not null
    and public.meeting_visible(target_meeting)
    and note.meeting_id = target_meeting
  order by note.created_at, note.id
$$;

revoke all on function public.meeting_note_entries_for_visible_meeting(uuid) from public, anon;
grant execute on function public.meeting_note_entries_for_visible_meeting(uuid) to authenticated;
