-- Complete the existing internal-chat MVP without creating a parallel chat model.
-- The original policies allowed only an uploader to read an attachment and did
-- not allow a personal conversation's two members to be created atomically.

alter table public.chat_conversations add column if not exists description text;
alter table public.chat_conversations add column if not exists group_type text check (group_type is null or group_type in ('general','department','team','management','project'));
create index if not exists chat_conversations_updated_idx on public.chat_conversations(updated_at desc);

create or replace function public.is_chat_member(conversation uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.chat_members cm
    join public.profiles p on p.id=cm.profile_id
    where cm.conversation_id=conversation and cm.profile_id=auth.uid() and p.status='active'
  )
$$;

create or replace function public.create_or_get_direct_chat(other_profile uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare conversation uuid;
begin
  if other_profile=auth.uid() then raise exception 'You cannot start a chat with yourself'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and status='active')
    or not exists(select 1 from public.profiles where id=other_profile and status='active') then
    raise exception 'Only active employees can use chat';
  end if;
  select c.id into conversation from public.chat_conversations c
  where c.conversation_type='personal'
    and (select count(*) from public.chat_members m where m.conversation_id=c.id)=2
    and exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.profile_id=auth.uid())
    and exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.profile_id=other_profile)
  limit 1;
  if conversation is not null then return conversation; end if;
  insert into public.chat_conversations(conversation_type,created_by,updated_at)
  values('personal',auth.uid(),now()) returning id into conversation;
  insert into public.chat_members(conversation_id,profile_id) values(conversation,auth.uid()),(conversation,other_profile);
  return conversation;
end $$;

create or replace function public.create_group_chat(chat_title text, chat_description text, chat_type text, member_ids uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare conversation uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and status='active') then raise exception 'Inactive employees cannot use chat'; end if;
  if coalesce(trim(chat_title),'')='' then raise exception 'A group name is required'; end if;
  if chat_type not in ('general','department','team','management','project') then raise exception 'Choose a valid group type'; end if;
  if (select count(distinct x) from unnest(array_append(coalesce(member_ids,'{}'::uuid[]),auth.uid())) x)<3 then raise exception 'A group needs at least two additional members'; end if;
  if exists(select 1 from unnest(coalesce(member_ids,'{}'::uuid[])) x left join public.profiles p on p.id=x where p.id is null or p.status<>'active') then raise exception 'Groups can contain active employees only'; end if;
  insert into public.chat_conversations(conversation_type,title,description,group_type,created_by,group_admin_id,updated_at)
  values('group',trim(chat_title),nullif(trim(chat_description),''),chat_type,auth.uid(),auth.uid(),now()) returning id into conversation;
  insert into public.chat_members(conversation_id,profile_id)
  select conversation,x from unnest(array_append(coalesce(member_ids,'{}'::uuid[]),auth.uid())) x on conflict do nothing;
  return conversation;
end $$;

create or replace function public.manage_group_chat_member(conversation uuid, member uuid, operation text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.chat_conversations where id=conversation and conversation_type='group' and group_admin_id=auth.uid()) then raise exception 'Only group admins can manage members'; end if;
  if operation='add' then
    if not exists(select 1 from public.profiles where id=member and status='active') then raise exception 'Only active employees can be added'; end if;
    insert into public.chat_members(conversation_id,profile_id) values(conversation,member) on conflict do nothing;
  elsif operation='remove' then
    if member=(select group_admin_id from public.chat_conversations where id=conversation) then raise exception 'The group creator cannot be removed'; end if;
    delete from public.chat_members where conversation_id=conversation and profile_id=member;
  else raise exception 'Unsupported member operation'; end if;
end $$;

drop policy if exists "chat conversations create" on public.chat_conversations;
drop policy if exists "chat members group admin write" on public.chat_members;
drop policy if exists "chat members leave" on public.chat_members;
drop policy if exists "chat members own update" on public.chat_members;
create policy "chat members own update" on public.chat_members for update to authenticated using(profile_id=auth.uid() and public.is_chat_member(conversation_id)) with check(profile_id=auth.uid() and public.is_chat_member(conversation_id));
create policy "chat members leave" on public.chat_members for delete to authenticated using(profile_id=auth.uid() and public.is_chat_member(conversation_id));

drop policy if exists "chat attachment upload" on storage.objects;
drop policy if exists "chat attachment member view" on storage.objects;
create policy "chat attachment upload" on storage.objects for insert to authenticated with check(
  bucket_id='chat-attachments' and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text
  and public.is_chat_member(((storage.foldername(name))[2])::uuid)
);
create policy "chat attachment member view" on storage.objects for select to authenticated using(
  bucket_id='chat-attachments' and exists(select 1 from public.chat_messages m where m.attachment_path=name and public.is_chat_member(m.conversation_id))
);
