-- Keep one canonical activity definition: latest message, then the existing
-- conversation timestamps for empty conversations. Conversation type never
-- participates in ranking.
alter table public.chat_conversations
  add column if not exists avatar_path text;

alter table public.chat_conversations
  add constraint chat_conversations_group_avatar_path
  check (
    avatar_path is null
    or (
      conversation_type = 'group'
      and avatar_path like 'groups/' || id::text || '/%'
    )
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'group-photos',
  'group-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "group photo admin upload" on storage.objects;
create policy "group photo admin upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'group-photos'
  and (storage.foldername(name))[1] = 'groups'
  and exists (
    select 1 from public.chat_conversations conversation
    where conversation.id::text = (storage.foldername(name))[2]
      and conversation.conversation_type = 'group'
      and conversation.group_admin_id = (select auth.uid())
      and conversation.archived_at is null
  )
);

drop policy if exists "group photo member view" on storage.objects;
create policy "group photo member view" on storage.objects
for select to authenticated
using (
  bucket_id = 'group-photos'
  and exists (
    select 1 from public.chat_conversations conversation
    where conversation.avatar_path = name
      and public.is_chat_member(conversation.id)
  )
);

drop policy if exists "group photo admin delete" on storage.objects;
create policy "group photo admin delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'group-photos'
  and (storage.foldername(name))[1] = 'groups'
  and exists (
    select 1 from public.chat_conversations conversation
    where conversation.id::text = (storage.foldername(name))[2]
      and conversation.conversation_type = 'group'
      and conversation.group_admin_id = (select auth.uid())
  )
);

drop function if exists public.chat_conversation_summaries();
create function public.chat_conversation_summaries()
returns table(
  conversation_id uuid,
  last_read_at timestamptz,
  chat_conversations jsonb,
  latest_message jsonb,
  unread_count bigint,
  mention_count bigint
)
language sql stable security invoker set search_path = public
as $$
  select membership.conversation_id, membership.last_read_at,
    to_jsonb(conversation) || jsonb_build_object('chat_members', coalesce(member_rows.members, '[]'::jsonb)),
    latest.message, coalesce(unread.total, 0), coalesce(mentions.total, 0)
  from public.chat_members membership
  join public.chat_conversations conversation on conversation.id = membership.conversation_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('profile_id', member.profile_id, 'profiles', jsonb_build_object(
      'full_name', profile.full_name, 'email', profile.email, 'designation', profile.designation,
      'department', case when department.id is null then null else jsonb_build_object('name', department.name) end,
      'avatar_url', profile.avatar_url, 'status', profile.status)) order by profile.full_name) members
    from public.chat_members member
    join public.profiles profile on profile.id = member.profile_id
    left join public.departments department on department.id = profile.department_id
    where member.conversation_id = membership.conversation_id
  ) member_rows on true
  left join lateral (
    select jsonb_build_object('id', message.id, 'conversation_id', message.conversation_id, 'body', message.body,
      'message_type', message.message_type, 'voice_duration_seconds', message.voice_duration_seconds,
      'attachment_name', message.attachment_name, 'created_at', message.created_at, 'sender_id', message.sender_id) message
    from public.chat_messages message
    where message.conversation_id = membership.conversation_id
    order by message.created_at desc, message.id desc limit 1
  ) latest on true
  left join lateral (
    select count(*) total from public.chat_messages message
    where message.conversation_id = membership.conversation_id and message.sender_id <> auth.uid()
      and (membership.last_read_at is null or message.created_at > membership.last_read_at)
  ) unread on true
  left join lateral (
    select count(*) total
    from public.chat_message_mentions mention
    join public.chat_messages message on message.id = mention.message_id
    where mention.conversation_id = membership.conversation_id
      and mention.profile_id = auth.uid()
      and (membership.last_read_at is null or message.created_at > membership.last_read_at)
  ) mentions on true
  where membership.profile_id = auth.uid() and conversation.archived_at is null
  order by coalesce(
    (latest.message ->> 'created_at')::timestamptz,
    conversation.updated_at,
    conversation.created_at
  ) desc, conversation.id asc
$$;

revoke all on function public.chat_conversation_summaries() from public, anon;
grant execute on function public.chat_conversation_summaries() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_conversations'
  ) then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end
$$;
