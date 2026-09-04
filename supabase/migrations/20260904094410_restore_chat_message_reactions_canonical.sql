-- Restore the persisted chat-reaction contract required by the application.
-- An obsolete QA-only migration originally introduced this table, but it was
-- never present in the canonical migration lineage.

do $$
begin
  if to_regclass('public.chat_messages') is null then
    raise exception 'Required table public.chat_messages is missing';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'Required table public.profiles is missing';
  end if;
  if to_regprocedure('public.is_chat_member(uuid)') is null then
    raise exception 'Required function public.is_chat_member(uuid) is missing';
  end if;
end
$$;

create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🎉')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

alter table public.chat_message_reactions enable row level security;

drop policy if exists "chat reactions visible to members" on public.chat_message_reactions;
create policy "chat reactions visible to members"
on public.chat_message_reactions
for select
to authenticated
using (
  public.is_chat_member((
    select message.conversation_id
    from public.chat_messages as message
    where message.id = public.chat_message_reactions.message_id
  ))
);

drop policy if exists "chat reactions own insert" on public.chat_message_reactions;
create policy "chat reactions own insert"
on public.chat_message_reactions
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and public.is_chat_member((
    select message.conversation_id
    from public.chat_messages as message
    where message.id = public.chat_message_reactions.message_id
  ))
);

drop policy if exists "chat reactions own delete" on public.chat_message_reactions;
create policy "chat reactions own delete"
on public.chat_message_reactions
for delete
to authenticated
using (
  profile_id = (select auth.uid())
  and public.is_chat_member((
    select message.conversation_id
    from public.chat_messages as message
    where message.id = public.chat_message_reactions.message_id
  ))
);

revoke all privileges on table public.chat_message_reactions from anon;
revoke all privileges on table public.chat_message_reactions from authenticated;
grant select, insert, delete on table public.chat_message_reactions to authenticated;

notify pgrst, 'reload schema';
