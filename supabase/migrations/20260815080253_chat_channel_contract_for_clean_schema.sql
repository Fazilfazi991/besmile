-- The current chat client always supplies and reads a channel identifier.
-- Older environments had this column before the channel-compatibility migration,
-- but a clean baseline did not. Establish the same contract for both paths.
alter table public.chat_conversations
  add column if not exists channel_id uuid;

update public.chat_conversations
set channel_id = id
where channel_id is null;

alter table public.chat_messages
  add column if not exists channel_id uuid;

update public.chat_messages
set channel_id = conversation_id
where channel_id is null;

-- Keep direct Data API writes consistent with the conversation selected by the
-- caller. Existing database functions may explicitly pass the same value.
create or replace function public.prepare_chat_message_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is null then
    raise exception 'A chat conversation is required';
  end if;

  select channel_id into new.channel_id
  from public.chat_conversations
  where id = new.conversation_id;

  if new.channel_id is null then
    raise exception 'The chat conversation is not ready';
  end if;

  return new;
end
$$;

drop trigger if exists chat_message_channel_before_write on public.chat_messages;
create trigger chat_message_channel_before_write
before insert or update of conversation_id on public.chat_messages
for each row execute function public.prepare_chat_message_channel();
