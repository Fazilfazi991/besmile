-- Release 2 forward correction after the workflows/client-sessions migration.
-- Canonical databases use conversation_id only. Older production-shaped
-- databases may also carry the legacy channel_id/chat_channels compatibility
-- surface introduced by 0032_chat_channel_id_compatibility.sql.

create or replace function public.create_or_get_direct_chat(other_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation uuid;
begin
  if not public.has_permission('chat.use') then
    raise exception 'You do not have permission to use chat';
  end if;
  if other_profile = auth.uid() then
    raise exception 'You cannot start a chat with yourself';
  end if;
  if not exists(
      select 1 from public.profiles
      where id = auth.uid()
        and is_employee = true
        and status::text in ('active', 'intern', 'probation')
    )
    or not exists(
      select 1 from public.profiles
      where id = other_profile
        and is_employee = true
        and status::text in ('active', 'intern', 'probation')
    )
    or not public.has_permission('chat.use', other_profile)
  then
    raise exception 'Only current chat-enabled employees can use chat';
  end if;

  -- Serialize a participant pair before checking for an existing direct chat.
  -- The lock is transaction-scoped and does not change persisted identifiers.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'direct-chat:'
        || least(auth.uid()::text, other_profile::text)
        || ':'
        || greatest(auth.uid()::text, other_profile::text),
      0
    )
  );

  select c.id
  into conversation
  from public.chat_conversations c
  where c.conversation_type = 'personal'
    and (select count(*) from public.chat_members m where m.conversation_id = c.id) = 2
    and exists(
      select 1 from public.chat_members m
      where m.conversation_id = c.id and m.profile_id = auth.uid()
    )
    and exists(
      select 1 from public.chat_members m
      where m.conversation_id = c.id and m.profile_id = other_profile
    )
  order by c.created_at, c.id
  limit 1;

  if conversation is not null then
    return conversation;
  end if;

  insert into public.chat_conversations(conversation_type, created_by, updated_at)
  values ('personal', auth.uid(), now())
  returning id into conversation;

  if exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_conversations'
      and column_name = 'channel_id'
  ) then
    execute $sql$
      update public.chat_conversations
      set channel_id = $1
      where id = $1 and channel_id is null
    $sql$ using conversation;
  end if;

  if exists(
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'chat_channels'
  ) then
    execute $sql$
      insert into public.chat_channels(id, name)
      values ($1, 'Direct conversation')
      on conflict (id) do nothing
    $sql$ using conversation;
  end if;

  insert into public.chat_members(conversation_id, profile_id)
  values (conversation, auth.uid()), (conversation, other_profile);

  return conversation;
end
$$;

create or replace function public.create_group_chat(
  chat_title text,
  chat_description text,
  chat_type text,
  member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation uuid;
begin
  if not public.has_permission('chat.use') then
    raise exception 'You do not have permission to use chat';
  end if;
  if not exists(
    select 1 from public.profiles
    where id = auth.uid()
      and is_employee = true
      and status::text in ('active', 'intern', 'probation')
  ) then
    raise exception 'Only current employees can use chat';
  end if;
  if coalesce(trim(chat_title), '') = '' then
    raise exception 'A group name is required';
  end if;
  if chat_type not in ('general', 'department', 'team', 'management', 'project') then
    raise exception 'Choose a valid group type';
  end if;
  if (
    select count(distinct x)
    from unnest(array_append(coalesce(member_ids, '{}'::uuid[]), auth.uid())) x
  ) < 3 then
    raise exception 'A group needs at least two additional members';
  end if;
  if exists(
    select 1
    from unnest(coalesce(member_ids, '{}'::uuid[])) x
    left join public.profiles p on p.id = x
    where p.id is null
      or p.is_employee <> true
      or p.status::text not in ('active', 'intern', 'probation')
      or not public.has_permission('chat.use', x)
  ) then
    raise exception 'Groups can contain current chat-enabled employees only';
  end if;

  insert into public.chat_conversations(
    conversation_type,
    title,
    description,
    group_type,
    created_by,
    group_admin_id,
    updated_at
  )
  values (
    'group',
    trim(chat_title),
    nullif(trim(chat_description), ''),
    chat_type,
    auth.uid(),
    auth.uid(),
    now()
  )
  returning id into conversation;

  if exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_conversations'
      and column_name = 'channel_id'
  ) then
    execute $sql$
      update public.chat_conversations
      set channel_id = $1
      where id = $1 and channel_id is null
    $sql$ using conversation;
  end if;

  if exists(
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'chat_channels'
  ) then
    execute $sql$
      insert into public.chat_channels(id, name)
      values ($1, $2)
      on conflict (id) do nothing
    $sql$ using conversation, trim(chat_title);
  end if;

  insert into public.chat_members(conversation_id, profile_id)
  select conversation, x
  from unnest(array_append(coalesce(member_ids, '{}'::uuid[]), auth.uid())) x
  on conflict do nothing;

  return conversation;
end
$$;

revoke all on function public.create_or_get_direct_chat(uuid)
  from public, anon;
grant execute on function public.create_or_get_direct_chat(uuid)
  to authenticated;

revoke all on function public.create_group_chat(text, text, text, uuid[])
  from public, anon;
grant execute on function public.create_group_chat(text, text, text, uuid[])
  to authenticated;
