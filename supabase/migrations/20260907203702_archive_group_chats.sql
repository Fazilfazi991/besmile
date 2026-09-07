alter table public.chat_conversations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create or replace function public.archive_group_chat(target_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.chat_conversations
  set archived_at = now(), archived_by = auth.uid(), updated_at = now()
  where id = target_conversation
    and conversation_type = 'group'
    and not is_system_group
    and group_admin_id = auth.uid()
    and archived_at is null;

  if not found then
    raise exception 'Only the group admin can archive an active custom group';
  end if;
end
$$;

revoke all on function public.archive_group_chat(uuid) from public, anon;
grant execute on function public.archive_group_chat(uuid) to authenticated;

create or replace function public.chat_conversation_summaries()
returns table(conversation_id uuid, last_read_at timestamptz, chat_conversations jsonb, latest_message jsonb, unread_count bigint)
language sql stable security invoker set search_path = public
as $$
  select membership.conversation_id, membership.last_read_at,
    to_jsonb(conversation) || jsonb_build_object('chat_members', coalesce(member_rows.members, '[]'::jsonb)),
    latest.message, coalesce(unread.total, 0)
  from public.chat_members membership
  join public.chat_conversations conversation on conversation.id = membership.conversation_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('profile_id', member.profile_id, 'profiles', jsonb_build_object(
      'full_name', profile.full_name, 'email', profile.email, 'designation', profile.designation,
      'department', case when department.id is null then null else jsonb_build_object('name', department.name) end,
      'avatar_url', profile.avatar_url, 'status', profile.status)) order by profile.full_name) members
    from public.chat_members member join public.profiles profile on profile.id = member.profile_id
    left join public.departments department on department.id = profile.department_id
    where member.conversation_id = membership.conversation_id
  ) member_rows on true
  left join lateral (
    select jsonb_build_object('id', message.id, 'conversation_id', message.conversation_id, 'body', message.body,
      'message_type', message.message_type, 'voice_duration_seconds', message.voice_duration_seconds,
      'attachment_name', message.attachment_name, 'created_at', message.created_at, 'sender_id', message.sender_id) message
    from public.chat_messages message where message.conversation_id = membership.conversation_id
    order by message.created_at desc, message.id desc limit 1
  ) latest on true
  left join lateral (
    select count(*) total from public.chat_messages message
    where message.conversation_id = membership.conversation_id and message.sender_id <> auth.uid()
      and (membership.last_read_at is null or message.created_at > membership.last_read_at)
  ) unread on true
  where membership.profile_id = auth.uid() and conversation.archived_at is null
  order by conversation.is_system_group desc, (conversation.conversation_type = 'group') desc,
    (latest.message ->> 'created_at')::timestamptz desc nulls last
$$;

revoke all on function public.chat_conversation_summaries() from public, anon;
grant execute on function public.chat_conversation_summaries() to authenticated;
