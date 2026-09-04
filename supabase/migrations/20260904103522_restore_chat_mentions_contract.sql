-- Phase 8E additive recovery of verified active Production contracts.
-- Source behavior recovered from reachable historical migrations; no data rows are copied.

-- Recovered from supabase/migrations/20260815061542_chat_directory_and_reactions.sql
-- Narrow chat directory: callers only receive fields needed to select a coworker.
create or replace function public.chat_recipient_search(search_text text default '')
returns table(id uuid, full_name text, designation text, avatar_url text, department_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.designation, p.avatar_url, d.name
  from public.profiles p left join public.departments d on d.id=p.department_id
  where auth.uid() is not null and public.has_permission('chat.use')
    and p.id <> auth.uid() and p.is_employee=true
    and p.status::text in ('active','intern','probation') and public.has_permission('chat.use', p.id)
    and (coalesce(trim(search_text),'')='' or p.full_name ilike '%'||trim(search_text)||'%')
  order by p.full_name limit 30
$$;
revoke all on function public.chat_recipient_search(text) from public, anon;
grant execute on function public.chat_recipient_search(text) to authenticated;

create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','🎉')),
  created_at timestamptz not null default now(), primary key(message_id,profile_id,emoji)
);
alter table public.chat_message_reactions enable row level security;
drop policy if exists "chat reactions visible to members" on public.chat_message_reactions;
drop policy if exists "chat reactions own insert" on public.chat_message_reactions;
drop policy if exists "chat reactions own delete" on public.chat_message_reactions;
create policy "chat reactions visible to members" on public.chat_message_reactions for select to authenticated using (public.is_chat_member((select conversation_id from public.chat_messages where id=message_id)));
create policy "chat reactions own insert" on public.chat_message_reactions for insert to authenticated with check (profile_id=auth.uid() and public.is_chat_member((select conversation_id from public.chat_messages where id=message_id)));
create policy "chat reactions own delete" on public.chat_message_reactions for delete to authenticated using (profile_id=auth.uid() and public.is_chat_member((select conversation_id from public.chat_messages where id=message_id)));
grant select,insert,delete on public.chat_message_reactions to authenticated;

-- Recovered from supabase/migrations/20260821140000_chat_mentions_and_read_state.sql
-- Normalized mentions and a message-id high-water mark reuse canonical chat membership.
alter table public.chat_members
  add column if not exists last_read_message_id uuid references public.chat_messages(id) on delete set null;

create table if not exists public.chat_message_mentions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);
create index if not exists chat_mentions_profile_conversation_idx on public.chat_message_mentions(profile_id, conversation_id, created_at desc);
create index if not exists chat_mentions_message_idx on public.chat_message_mentions(message_id);

alter table public.chat_message_mentions enable row level security;
create policy "chat mentions visible to members" on public.chat_message_mentions
for select to authenticated using (public.is_chat_member(conversation_id));

create or replace function public.assert_chat_mentions(target_conversation uuid, target_profiles uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce(array_length(target_profiles, 1), 0) = 0 then return; end if;
  if exists (
    select 1 from unnest(target_profiles) mentioned_id
    where not exists (
      select 1 from public.chat_members m join public.profiles p on p.id=m.profile_id
      where m.conversation_id=target_conversation and m.profile_id=mentioned_id
        and p.is_employee=true and p.status::text in ('active','intern','probation')
    )
  ) then raise exception 'Mentions must be active participants in this conversation'; end if;
end $$;

create or replace function public.sync_chat_message_mentions(target_message uuid, target_conversation uuid, target_profiles uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.chat_messages where id=target_message and conversation_id=target_conversation and sender_id=auth.uid()) then
    raise exception 'Only the sender can set message mentions';
  end if;
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
  update public.chat_messages m set body=trim(next_body),edited_at=now()
  where m.id=target_message and m.sender_id=auth.uid() and m.message_type='text'
    and m.deleted_at is null and public.is_chat_member(m.conversation_id)
  returning m.* into updated_message;
  if updated_message.id is null then raise exception 'This message is not eligible for editing'; end if;
  perform public.sync_chat_message_mentions(updated_message.id, updated_message.conversation_id, mention_profiles);
  return updated_message;
end $$;

create or replace function public.mark_chat_conversation_read(target_conversation uuid, target_message uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_chat_member(target_conversation) then raise exception 'Conversation access is required'; end if;
  if target_message is not null and not exists(select 1 from public.chat_messages where id=target_message and conversation_id=target_conversation) then
    raise exception 'Read position must belong to the conversation';
  end if;
  update public.chat_members set last_read_at=now(),last_read_message_id=coalesce(target_message,last_read_message_id)
  where conversation_id=target_conversation and profile_id=auth.uid();
end $$;

revoke all on public.chat_message_mentions from public, anon, authenticated;
grant select on public.chat_message_mentions to authenticated;
revoke all on function public.assert_chat_mentions(uuid,uuid[]) from public, anon;
revoke all on function public.sync_chat_message_mentions(uuid,uuid,uuid[]) from public, anon;
revoke all on function public.edit_chat_message(uuid,text,uuid[]) from public, anon;
revoke all on function public.mark_chat_conversation_read(uuid,uuid) from public, anon;
grant execute on function public.edit_chat_message(uuid,text,uuid[]) to authenticated;
grant execute on function public.mark_chat_conversation_read(uuid,uuid) to authenticated;
grant execute on function public.sync_chat_message_mentions(uuid,uuid,uuid[]) to authenticated;

revoke execute on function public.assert_chat_mentions(uuid,uuid[]) from public,anon,authenticated;
revoke execute on function public.sync_chat_message_mentions(uuid,uuid,uuid[]) from public,anon;
alter publication supabase_realtime add table public.chat_message_mentions;
