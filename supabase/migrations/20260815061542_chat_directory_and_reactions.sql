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
create policy "chat reactions visible to members" on public.chat_message_reactions for select to authenticated using (public.is_chat_member((select conversation_id from public.chat_messages where id=message_id)));
create policy "chat reactions own insert" on public.chat_message_reactions for insert to authenticated with check (profile_id=auth.uid() and public.is_chat_member((select conversation_id from public.chat_messages where id=message_id)));
create policy "chat reactions own delete" on public.chat_message_reactions for delete to authenticated using (profile_id=auth.uid() and public.is_chat_member((select conversation_id from public.chat_messages where id=message_id)));
grant select,insert,delete on public.chat_message_reactions to authenticated;
