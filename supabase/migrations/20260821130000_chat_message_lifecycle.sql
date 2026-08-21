-- Persisted reply, edit, and soft-delete lifecycle for canonical chat messages.
-- Attachment objects are deliberately retained; storage cleanup needs an explicit retention policy.
alter table public.chat_messages
  add column if not exists reply_to_message_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists chat_messages_reply_to_message_idx
  on public.chat_messages(reply_to_message_id)
  where reply_to_message_id is not null;

create or replace function public.chat_reply_target_is_valid(target_message uuid, target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_message is null or exists (
    select 1 from public.chat_messages m
    where m.id = target_message
      and m.conversation_id = target_conversation
      and public.is_chat_member(m.conversation_id)
  )
$$;

drop policy if exists "chat messages send" on public.chat_messages;
create policy "chat messages send" on public.chat_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_chat_member(conversation_id)
  and public.chat_reply_target_is_valid(reply_to_message_id, conversation_id)
);

create or replace function public.edit_chat_message(target_message uuid, next_body text)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare updated_message public.chat_messages;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if coalesce(trim(next_body), '') = '' then raise exception 'A message cannot be empty'; end if;

  update public.chat_messages m
  set body = trim(next_body), edited_at = now()
  where m.id = target_message
    and m.sender_id = auth.uid()
    and m.message_type = 'text'
    and m.deleted_at is null
    and public.is_chat_member(m.conversation_id)
  returning m.* into updated_message;

  if updated_message.id is null then
    raise exception 'This message is not eligible for editing';
  end if;
  return updated_message;
end
$$;

create or replace function public.delete_chat_message(target_message uuid)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare updated_message public.chat_messages;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;

  update public.chat_messages m
  set body = '', deleted_at = now(), deleted_by = auth.uid()
  where m.id = target_message
    and m.sender_id = auth.uid()
    and m.deleted_at is null
    and public.is_chat_member(m.conversation_id)
  returning m.* into updated_message;

  if updated_message.id is null then
    raise exception 'This message is not eligible for deletion';
  end if;
  return updated_message;
end
$$;

revoke all on function public.chat_reply_target_is_valid(uuid, uuid) from public, anon;
revoke all on function public.edit_chat_message(uuid, text) from public, anon;
revoke all on function public.delete_chat_message(uuid) from public, anon;
grant execute on function public.edit_chat_message(uuid, text) to authenticated;
grant execute on function public.delete_chat_message(uuid) to authenticated;
