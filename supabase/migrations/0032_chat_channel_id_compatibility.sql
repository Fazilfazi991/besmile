-- The connected project contains a legacy chat_messages.channel_id NOT NULL
-- column alongside the newer conversation_id model.  Keep one canonical
-- conversation record, give it a persisted channel, and populate both values.

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='chat_messages' and column_name='channel_id') then
    alter table public.chat_conversations add column if not exists channel_id uuid;
    update public.chat_conversations set channel_id=id where channel_id is null;

    if exists(select 1 from information_schema.tables where table_schema='public' and table_name='chat_channels') then
      execute $channels$insert into public.chat_channels(id,name,type)
        select channel_id,
          coalesce(nullif(title,''),case when conversation_type='personal' then 'Direct conversation' else 'Untitled group' end),
          case when conversation_type='personal' then 'direct' else 'group' end
        from public.chat_conversations on conflict (id) do nothing$channels$;
    end if;
  end if;
end $$;

create or replace function public.prepare_chat_message_channel()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.conversation_id is null then raise exception 'A chat conversation is required'; end if;
  select coalesce(channel_id,id) into new.channel_id from public.chat_conversations where id=new.conversation_id;
  if new.channel_id is null then raise exception 'The chat conversation is not ready'; end if;
  return new;
end $$;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='chat_messages' and column_name='channel_id') then
    drop trigger if exists chat_message_channel_before_write on public.chat_messages;
    create trigger chat_message_channel_before_write before insert or update of conversation_id on public.chat_messages for each row execute function public.prepare_chat_message_channel();
    update public.chat_messages m set channel_id=coalesce(c.channel_id,c.id) from public.chat_conversations c where c.id=m.conversation_id and m.channel_id is null;
  end if;
end $$;

create or replace function public.create_or_get_direct_chat(other_profile uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare conversation uuid;
begin
  if other_profile=auth.uid() then raise exception 'You cannot start a chat with yourself'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and status='active') or not exists(select 1 from public.profiles where id=other_profile and status='active') then raise exception 'Only active employees can use chat'; end if;
  select c.id into conversation from public.chat_conversations c where c.conversation_type='personal' and (select count(*) from public.chat_members m where m.conversation_id=c.id)=2 and exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.profile_id=auth.uid()) and exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.profile_id=other_profile) limit 1;
  if conversation is not null then return conversation; end if;
  insert into public.chat_conversations(conversation_type,created_by,updated_at) values('personal',auth.uid(),now()) returning id into conversation;
  update public.chat_conversations set channel_id=conversation where id=conversation and channel_id is null;
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='chat_channels') then insert into public.chat_channels(id,name,type) values(conversation,'Direct conversation','direct') on conflict (id) do nothing; end if;
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
  insert into public.chat_conversations(conversation_type,title,description,group_type,created_by,group_admin_id,updated_at) values('group',trim(chat_title),nullif(trim(chat_description),''),chat_type,auth.uid(),auth.uid(),now()) returning id into conversation;
  update public.chat_conversations set channel_id=conversation where id=conversation and channel_id is null;
  if exists(select 1 from information_schema.tables where table_schema='public' and table_name='chat_channels') then insert into public.chat_channels(id,name,type) values(conversation,trim(chat_title),'group') on conflict (id) do nothing; end if;
  insert into public.chat_members(conversation_id,profile_id) select conversation,x from unnest(array_append(coalesce(member_ids,'{}'::uuid[]),auth.uid())) x on conflict do nothing;
  return conversation;
end $$;
