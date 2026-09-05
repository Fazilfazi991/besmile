-- Add truthful, per-recipient delivery state to the existing chat read receipts.
alter table public.chat_message_reads
  add column if not exists delivered_at timestamptz;

alter table public.chat_message_reads
  alter column read_at drop not null;

alter table public.chat_message_reads
  alter column read_at drop default;

update public.chat_message_reads
set delivered_at = read_at
where read_at is not null and delivered_at is null;

create index if not exists chat_message_reads_message_status_idx
  on public.chat_message_reads(message_id, profile_id, delivered_at, read_at);

drop policy if exists "chat reads own" on public.chat_message_reads;
drop policy if exists "chat receipts visible to recipient and sender" on public.chat_message_reads;
create policy "chat receipts visible to recipient and sender"
on public.chat_message_reads for select to authenticated
using (
  (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.chat_messages own_message
      where own_message.id = chat_message_reads.message_id
        and public.is_chat_member(own_message.conversation_id)
    )
  ) or exists (
    select 1
    from public.chat_messages message
    where message.id = chat_message_reads.message_id
      and message.sender_id = (select auth.uid())
      and public.is_chat_member(message.conversation_id)
  )
);

drop policy if exists "chat reads insert own" on public.chat_message_reads;
create policy "chat receipts insert own"
on public.chat_message_reads for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.chat_messages message
    where message.id = chat_message_reads.message_id
      and message.sender_id <> (select auth.uid())
      and public.is_chat_member(message.conversation_id)
  )
);

drop policy if exists "chat receipts update own" on public.chat_message_reads;
create policy "chat receipts update own"
on public.chat_message_reads for update to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.chat_messages message
    where message.id = chat_message_reads.message_id
      and message.sender_id <> (select auth.uid())
      and public.is_chat_member(message.conversation_id)
  )
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.chat_messages message
    where message.id = chat_message_reads.message_id
      and message.sender_id <> (select auth.uid())
      and public.is_chat_member(message.conversation_id)
  )
);

create or replace function public.mark_chat_conversation_delivered(target_conversation uuid, target_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_created_at timestamptz;
begin
  if auth.uid() is null or not public.is_chat_member(target_conversation) then
    raise exception 'Conversation access is required';
  end if;

  select created_at into target_created_at
  from public.chat_messages
  where id = target_message and conversation_id = target_conversation;
  if target_created_at is null then raise exception 'Delivery position must belong to the conversation'; end if;

  insert into public.chat_message_reads(message_id, profile_id, delivered_at, read_at)
  select message.id, auth.uid(), now(), null
  from public.chat_messages message
  where message.conversation_id = target_conversation
    and message.sender_id <> auth.uid()
    and message.created_at <= target_created_at
    and message.deleted_at is null
    and message.expired_at is null
  on conflict (message_id, profile_id) do update
    set delivered_at = coalesce(chat_message_reads.delivered_at, excluded.delivered_at);
end;
$$;

create or replace function public.mark_chat_conversation_read(target_conversation uuid, target_message uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_created_at timestamptz;
begin
  if auth.uid() is null or not public.is_chat_member(target_conversation) then
    raise exception 'Conversation access is required';
  end if;

  select created_at into target_created_at
  from public.chat_messages
  where id = target_message and conversation_id = target_conversation;
  if target_message is not null and target_created_at is null then
    raise exception 'Read position must belong to the conversation';
  end if;

  update public.chat_members
  set last_read_at = now(), last_read_message_id = coalesce(target_message, last_read_message_id)
  where conversation_id = target_conversation and profile_id = auth.uid();

  if target_created_at is not null then
    insert into public.chat_message_reads(message_id, profile_id, delivered_at, read_at)
    select message.id, auth.uid(), now(), now()
    from public.chat_messages message
    where message.conversation_id = target_conversation
      and message.sender_id <> auth.uid()
      and message.created_at <= target_created_at
      and message.deleted_at is null
      and message.expired_at is null
    on conflict (message_id, profile_id) do update
      set delivered_at = coalesce(chat_message_reads.delivered_at, excluded.delivered_at),
          read_at = coalesce(chat_message_reads.read_at, excluded.read_at);
  end if;
end;
$$;

revoke all on function public.mark_chat_conversation_delivered(uuid, uuid) from public, anon;
revoke all on function public.mark_chat_conversation_read(uuid, uuid) from public, anon;
grant execute on function public.mark_chat_conversation_delivered(uuid, uuid) to authenticated;
grant execute on function public.mark_chat_conversation_read(uuid, uuid) to authenticated;
