-- Client IDs reconcile an optimistic browser message with its persisted row and
-- the corresponding Realtime event without relying on message text.
alter table public.chat_messages add column if not exists client_message_id uuid;
create unique index if not exists chat_messages_sender_client_message_idx on public.chat_messages(sender_id,client_message_id) where client_message_id is not null;
