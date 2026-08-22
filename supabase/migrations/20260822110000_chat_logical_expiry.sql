-- expires_at is the immediate visibility cutoff; expired_at records later cleanup.
create or replace function public.chat_message_is_logically_expired(message_expires_at timestamptz, message_expired_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select message_expired_at is not null
    or (message_expires_at is not null and message_expires_at <= now())
$$;

-- Expired messages stay in the thread as an audit record, but never become a
-- conversation preview or unread item before the cleanup worker runs.
create or replace function public.chat_conversation_summaries()
returns table(conversation_id uuid,last_read_at timestamptz,chat_conversations jsonb,latest_message jsonb,unread_count bigint)
language sql stable security invoker set search_path=public as $$
  select membership.conversation_id,membership.last_read_at,
    to_jsonb(conversation) || jsonb_build_object('chat_members',coalesce(member_rows.members,'[]'::jsonb)),latest.message,coalesce(unread.total,0)
  from public.chat_members membership join public.chat_conversations conversation on conversation.id=membership.conversation_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('profile_id',member.profile_id,'profiles',jsonb_build_object('full_name',profile.full_name,'email',profile.email,'designation',profile.designation,'department',case when department.id is null then null else jsonb_build_object('name',department.name) end,'avatar_url',profile.avatar_url,'status',profile.status)) order by profile.full_name) members
    from public.chat_members member join public.profiles profile on profile.id=member.profile_id left join public.departments department on department.id=profile.department_id where member.conversation_id=membership.conversation_id
  ) member_rows on true
  left join lateral (
    select jsonb_build_object('id',message.id,'conversation_id',message.conversation_id,'body',message.body,'message_type',message.message_type,'voice_duration_seconds',message.voice_duration_seconds,'attachment_name',message.attachment_name,'created_at',message.created_at,'sender_id',message.sender_id) message
    from public.chat_messages message where message.conversation_id=membership.conversation_id and message.deleted_at is null and message.message_type<>'system'
      and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
    order by message.created_at desc,message.id desc limit 1
  ) latest on true
  left join lateral (
    select count(*) total from public.chat_messages message where message.conversation_id=membership.conversation_id and message.sender_id<>auth.uid() and message.deleted_at is null and message.message_type<>'system'
      and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
      and (membership.last_read_at is null or message.created_at>membership.last_read_at)
  ) unread on true
  where membership.profile_id=auth.uid()
  order by conversation.is_system_group desc,(conversation.conversation_type='group') desc,(latest.message->>'created_at')::timestamptz desc nulls last
$$;

-- Mention rows and reactions cannot remain active representations of content
-- that has crossed its visibility cutoff. The worker can still delete them.
drop policy if exists "chat mentions visible to members" on public.chat_message_mentions;
create policy "chat mentions visible to members" on public.chat_message_mentions
for select to authenticated using (
  public.is_chat_member(conversation_id)
  and exists (
    select 1 from public.chat_messages message
    where message.id=message_id and message.conversation_id=chat_message_mentions.conversation_id
      and message.deleted_at is null
      and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
  )
);

drop policy if exists "chat reactions visible to members" on public.chat_message_reactions;
drop policy if exists "chat reactions own insert" on public.chat_message_reactions;
drop policy if exists "chat reactions own delete" on public.chat_message_reactions;
create policy "chat reactions visible to members" on public.chat_message_reactions
for select to authenticated using (
  exists (
    select 1 from public.chat_messages message
    where message.id=message_id and message.deleted_at is null
      and public.is_chat_member(message.conversation_id)
      and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
  )
);
create policy "chat reactions own insert" on public.chat_message_reactions
for insert to authenticated with check (
  profile_id=auth.uid()
  and exists (
    select 1 from public.chat_messages message
    where message.id=message_id and message.deleted_at is null
      and public.is_chat_member(message.conversation_id)
      and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
  )
);
create policy "chat reactions own delete" on public.chat_message_reactions
for delete to authenticated using (
  profile_id=auth.uid()
  and public.is_chat_member((select conversation_id from public.chat_messages where id=message_id))
);

-- Supabase Storage evaluates this SELECT policy before issuing a signed URL.
drop policy if exists "chat attachment member view" on storage.objects;
create policy "chat attachment member view" on storage.objects for select to authenticated using(
  bucket_id='chat-attachments' and exists(
    select 1 from public.chat_messages message where message.attachment_path=name
      and message.deleted_at is null and public.is_chat_member(message.conversation_id)
      and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
  )
);

create or replace function public.sync_chat_message_mentions(target_message uuid, target_conversation uuid, target_profiles uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.chat_messages message where message.id=target_message
      and message.conversation_id=target_conversation and message.sender_id=auth.uid()
      and message.deleted_at is null
      and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
  ) then raise exception 'Only the sender can set mentions on an active message'; end if;
  perform public.assert_chat_mentions(target_conversation, target_profiles);
  delete from public.chat_message_mentions where message_id=target_message;
  insert into public.chat_message_mentions(message_id,profile_id,conversation_id)
  select target_message, mentioned_id, target_conversation from unnest(coalesce(target_profiles,'{}'::uuid[])) mentioned_id
  on conflict do nothing;
end $$;

create or replace function public.edit_chat_message(target_message uuid, next_body text, mention_profiles uuid[] default '{}')
returns public.chat_messages language plpgsql security definer set search_path=public as $$
declare updated_message public.chat_messages;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if coalesce(trim(next_body),'')='' then raise exception 'A message cannot be empty'; end if;
  update public.chat_messages message set body=trim(next_body),edited_at=now()
  where message.id=target_message and message.sender_id=auth.uid() and message.message_type='text'
    and message.deleted_at is null and public.is_chat_member(message.conversation_id)
    and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)
  returning message.* into updated_message;
  if updated_message.id is null then raise exception 'This message is not eligible for editing'; end if;
  perform public.sync_chat_message_mentions(updated_message.id, updated_message.conversation_id, mention_profiles);
  return updated_message;
end $$;

revoke all on function public.chat_message_is_logically_expired(timestamptz,timestamptz) from public, anon;
grant execute on function public.chat_message_is_logically_expired(timestamptz,timestamptz) to authenticated, service_role;
