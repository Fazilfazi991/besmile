-- System-managed company chat and voice-message metadata.
-- Existing direct conversations and messages remain unchanged.

alter table public.chat_conversations
  add column if not exists is_system_group boolean not null default false,
  add column if not exists system_key text;

create unique index if not exists chat_conversations_system_key_unique
  on public.chat_conversations(system_key)
  where system_key is not null;

alter table public.chat_messages
  add column if not exists voice_duration_seconds integer
  check (voice_duration_seconds is null or voice_duration_seconds between 1 and 3600);

alter table public.chat_messages drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages add constraint chat_messages_message_type_check
  check (message_type in ('text', 'attachment', 'voice'));

create or replace function public.ensure_all_employees_chat_member(target_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company_conversation uuid;
  eligible boolean;
begin
  select p.is_employee = true
    and p.status::text in ('active', 'intern', 'probation')
    and public.has_permission('chat.use', p.id)
  into eligible
  from public.profiles p
  where p.id = target_profile;

  select id into company_conversation
  from public.chat_conversations
  where system_key = 'all_employees'
  limit 1;

  if company_conversation is null then
    insert into public.chat_conversations(
      conversation_type, title, description, group_type,
      is_system_group, system_key, updated_at
    ) values (
      'group', 'All Employees', 'Company-wide updates and employee conversation.', 'general',
      true, 'all_employees', now()
    )
    on conflict (system_key) where system_key is not null do update set
      title = 'All Employees', is_system_group = true
    returning id into company_conversation;

    update public.chat_conversations
    set channel_id = company_conversation
    where id = company_conversation and channel_id is null;

    if exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chat_channels') then
      insert into public.chat_channels(id, name)
      values(company_conversation, 'All Employees')
      on conflict (id) do nothing;
    end if;
  end if;

  if coalesce(eligible, false) then
    insert into public.chat_members(conversation_id, profile_id)
    values(company_conversation, target_profile)
    on conflict do nothing;
  else
    delete from public.chat_members
    where conversation_id = company_conversation and profile_id = target_profile;
  end if;

  return company_conversation;
end
$$;

create or replace function public.ensure_my_all_employees_chat()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  return public.ensure_all_employees_chat_member(auth.uid());
end
$$;

revoke all on function public.ensure_all_employees_chat_member(uuid) from public, authenticated;
revoke all on function public.ensure_my_all_employees_chat() from public;
grant execute on function public.ensure_my_all_employees_chat() to authenticated;

select public.ensure_all_employees_chat_member(p.id)
from public.profiles p
where p.is_employee = true;

create or replace function public.sync_all_employees_chat_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_all_employees_chat_member(new.id);
  return new;
end
$$;

drop trigger if exists sync_all_employees_chat_membership on public.profiles;
create trigger sync_all_employees_chat_membership
after insert or update of status, is_employee, role on public.profiles
for each row execute function public.sync_all_employees_chat_membership();

create or replace function public.is_chat_member(conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('chat.use')
    and exists (
      select 1
      from public.chat_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.conversation_id = conversation
        and cm.profile_id = auth.uid()
        and p.is_employee = true
        and p.status::text in ('active', 'intern', 'probation')
    )
$$;

drop policy if exists "chat members leave" on public.chat_members;
create policy "chat members leave" on public.chat_members
for delete to authenticated
using (
  profile_id = auth.uid()
  and public.is_chat_member(conversation_id)
  and not exists (
    select 1 from public.chat_conversations c
    where c.id = conversation_id and c.is_system_group
  )
);

create or replace function public.manage_group_chat_member(conversation uuid, member uuid, operation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists(select 1 from public.chat_conversations where id = conversation and is_system_group) then
    raise exception 'The All Employees group is managed automatically';
  end if;
  if not public.has_permission('chat.use') then raise exception 'You do not have permission to use chat'; end if;
  if not exists(select 1 from public.chat_conversations where id = conversation and conversation_type = 'group' and group_admin_id = auth.uid()) then raise exception 'Only group admins can manage members'; end if;
  if operation = 'add' then
    if not exists(select 1 from public.profiles where id = member and is_employee = true and status::text in ('active','intern','probation'))
      or not public.has_permission('chat.use', member) then raise exception 'Only current chat-enabled employees can be added'; end if;
    insert into public.chat_members(conversation_id, profile_id) values(conversation, member) on conflict do nothing;
  elsif operation = 'remove' then
    if member = (select group_admin_id from public.chat_conversations where id = conversation) then raise exception 'The group creator cannot be removed'; end if;
    delete from public.chat_members where conversation_id = conversation and profile_id = member;
  else raise exception 'Unsupported member operation';
  end if;
end
$$;

drop policy if exists "chat groups admin update" on public.chat_conversations;
create policy "chat groups admin update" on public.chat_conversations
for update to authenticated
using(group_admin_id = auth.uid() and not is_system_group)
with check(group_admin_id = auth.uid() and not is_system_group);

create or replace function public.create_or_get_direct_chat(other_profile uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare conversation uuid;
begin
  if not public.has_permission('chat.use') then raise exception 'You do not have permission to use chat'; end if;
  if other_profile=auth.uid() then raise exception 'You cannot start a chat with yourself'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and is_employee=true and status::text in ('active','intern','probation'))
    or not exists(select 1 from public.profiles where id=other_profile and is_employee=true and status::text in ('active','intern','probation'))
    or not public.has_permission('chat.use', other_profile) then raise exception 'Only current chat-enabled employees can use chat'; end if;
  select c.id into conversation from public.chat_conversations c where c.conversation_type='personal'
    and (select count(*) from public.chat_members m where m.conversation_id=c.id)=2
    and exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.profile_id=auth.uid())
    and exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.profile_id=other_profile) limit 1;
  if conversation is not null then return conversation; end if;
  insert into public.chat_conversations(conversation_type,created_by,updated_at) values('personal',auth.uid(),now()) returning id into conversation;
  update public.chat_conversations set channel_id=conversation where id=conversation and channel_id is null;
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='chat_channels') then insert into public.chat_channels(id,name) values(conversation,'Direct conversation') on conflict(id) do nothing; end if;
  insert into public.chat_members(conversation_id,profile_id) values(conversation,auth.uid()),(conversation,other_profile);
  return conversation;
end $$;

create or replace function public.create_group_chat(chat_title text, chat_description text, chat_type text, member_ids uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare conversation uuid;
begin
  if not public.has_permission('chat.use') then raise exception 'You do not have permission to use chat'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and is_employee=true and status::text in ('active','intern','probation')) then raise exception 'Only current employees can use chat'; end if;
  if coalesce(trim(chat_title),'')='' then raise exception 'A group name is required'; end if;
  if chat_type not in ('general','department','team','management','project') then raise exception 'Choose a valid group type'; end if;
  if (select count(distinct x) from unnest(array_append(coalesce(member_ids,'{}'::uuid[]),auth.uid())) x)<3 then raise exception 'A group needs at least two additional members'; end if;
  if exists(select 1 from unnest(coalesce(member_ids,'{}'::uuid[])) x left join public.profiles p on p.id=x where p.id is null or p.is_employee<>true or p.status::text not in ('active','intern','probation') or not public.has_permission('chat.use',x)) then raise exception 'Groups can contain current chat-enabled employees only'; end if;
  insert into public.chat_conversations(conversation_type,title,description,group_type,created_by,group_admin_id,updated_at) values('group',trim(chat_title),nullif(trim(chat_description),''),chat_type,auth.uid(),auth.uid(),now()) returning id into conversation;
  update public.chat_conversations set channel_id=conversation where id=conversation and channel_id is null;
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='chat_channels') then insert into public.chat_channels(id,name) values(conversation,trim(chat_title)) on conflict(id) do nothing; end if;
  insert into public.chat_members(conversation_id,profile_id) select conversation,x from unnest(array_append(coalesce(member_ids,'{}'::uuid[]),auth.uid())) x on conflict do nothing;
  return conversation;
end $$;

create or replace function public.notify_chat_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare member record;
begin
  for member in
    select cm.profile_id from public.chat_members cm join public.profiles p on p.id=cm.profile_id
    where cm.conversation_id=new.conversation_id and cm.profile_id<>new.sender_id
      and p.is_employee=true and p.status::text in ('active','intern','probation')
      and public.has_permission('chat.use', cm.profile_id)
  loop
    perform public.notify_user(member.profile_id,'New message',case when new.message_type='voice' then 'Voice message' else coalesce(nullif(new.body,''),'Attachment received') end,'chat_message',new.id,'/employee/chat',new.sender_id);
  end loop;
  return new;
end $$;
