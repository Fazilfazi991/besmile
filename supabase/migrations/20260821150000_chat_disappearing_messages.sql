-- Server-enforced retention state. Historical messages remain non-expiring.
alter table public.chat_conversations
  add column if not exists disappearing_message_seconds integer not null default 0
  check (disappearing_message_seconds in (0, 86400, 604800, 2592000));
alter table public.chat_messages
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists attachment_cleanup_state text not null default 'not_required',
  add column if not exists attachment_cleanup_attempts integer not null default 0,
  add column if not exists attachment_cleanup_last_error text;
alter table public.chat_messages drop constraint if exists chat_messages_attachment_cleanup_state_check;
alter table public.chat_messages add constraint chat_messages_attachment_cleanup_state_check
  check (attachment_cleanup_state in ('not_required','pending','processing','failed','completed'));
alter table public.chat_messages drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages add constraint chat_messages_message_type_check
  check (message_type in ('text', 'attachment', 'voice', 'system'));
create index if not exists chat_messages_expiry_cleanup_idx
  on public.chat_messages(expires_at) where expires_at is not null and expired_at is null;

create or replace function public.assign_chat_message_expiry()
returns trigger language plpgsql security definer set search_path=public as $$
declare retention_seconds integer;
begin
  select disappearing_message_seconds into retention_seconds from public.chat_conversations where id=new.conversation_id;
  if new.message_type <> 'system' and coalesce(retention_seconds,0)>0 then new.expires_at=now()+make_interval(secs=>retention_seconds); end if;
  return new;
end $$;
drop trigger if exists chat_message_expiry_before_insert on public.chat_messages;
create trigger chat_message_expiry_before_insert before insert on public.chat_messages
for each row execute function public.assign_chat_message_expiry();

create or replace function public.set_chat_disappearing_messages(target_conversation uuid, retention_seconds integer)
returns void language plpgsql security definer set search_path=public as $$
declare
  prior_retention_seconds integer;
  actor_name text;
begin
  if retention_seconds not in (0,86400,604800,2592000) then raise exception 'Unsupported disappearing message duration'; end if;
  if not public.is_chat_member(target_conversation) then raise exception 'Conversation access is required'; end if;
  if exists(select 1 from public.chat_conversations where id=target_conversation and conversation_type='group' and coalesce(group_admin_id,created_by)<>auth.uid()) then
    raise exception 'Only the group admin can change disappearing messages';
  end if;
  select disappearing_message_seconds into prior_retention_seconds from public.chat_conversations where id=target_conversation;
  update public.chat_conversations set disappearing_message_seconds=retention_seconds,updated_at=now() where id=target_conversation;
  select full_name into actor_name from public.profiles where id=auth.uid();
  insert into public.chat_messages(conversation_id,sender_id,body,message_type)
  values (target_conversation,auth.uid(),case
    when retention_seconds=0 then coalesce(actor_name,'A participant') || ' turned off disappearing messages.'
    when prior_retention_seconds=0 then coalesce(actor_name,'A participant') || ' turned on disappearing messages. New messages disappear after ' || case retention_seconds when 86400 then '24 hours.' when 604800 then '7 days.' else '30 days.' end
    else 'Disappearing messages were changed to ' || case retention_seconds when 86400 then '24 hours.' when 604800 then '7 days.' else '30 days.' end
  end,'system');
end $$;

create or replace function public.expire_chat_messages()
returns integer language plpgsql security definer set search_path=public as $$
declare expired_count integer;
begin
  with expired as (
    update public.chat_messages set body='', expired_at=now(), attachment_cleanup_state=case when attachment_path is null then 'not_required' else 'pending' end
    where expires_at<=now() and expired_at is null returning id
  ), cleanup_mentions as (delete from public.chat_message_mentions where message_id in(select id from expired)),
  cleanup_reactions as (delete from public.chat_message_reactions where message_id in(select id from expired))
  select count(*) into expired_count from expired;
  return expired_count;
end $$;
revoke all on function public.set_chat_disappearing_messages(uuid,integer) from public,anon;
revoke all on function public.expire_chat_messages() from public,anon,authenticated;
grant execute on function public.set_chat_disappearing_messages(uuid,integer) to authenticated;
grant execute on function public.expire_chat_messages() to service_role;

-- System lifecycle events are thread-visible but never generate a normal
-- notification. The trusted hourly route invokes expiry and Storage cleanup.
create or replace function public.notify_chat_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare member record;
begin
  if new.message_type = 'system' then return new; end if;
  for member in
    select cm.profile_id from public.chat_members cm join public.profiles p on p.id=cm.profile_id
    where cm.conversation_id=new.conversation_id and cm.profile_id<>new.sender_id
      and p.is_employee=true and p.status::text in ('active','intern','probation')
      and public.has_permission('chat.use',cm.profile_id)
  loop
    perform public.notify_user(member.profile_id,'New message'::text,(case when new.message_type='voice' then 'Voice message' else coalesce(nullif(new.body,''),'Attachment received') end)::text,'chat_message'::text,new.id,'/employee/chat'::text,new.sender_id,'system'::text,'normal'::text,'none'::text,false,'{}'::jsonb);
  end loop;
  return new;
end $$;

-- Do not allow expired/deleted content (or system events) to become a preview
-- or unread item. Existing member payload shape is retained for ChatHub.
create or replace function public.chat_conversation_summaries()
returns table(conversation_id uuid,last_read_at timestamptz,chat_conversations jsonb,latest_message jsonb,unread_count bigint)
language sql stable security invoker set search_path=public as $$
  select membership.conversation_id,membership.last_read_at,
    to_jsonb(conversation) || jsonb_build_object('chat_members',coalesce(member_rows.members,'[]'::jsonb)),latest.message,coalesce(unread.total,0)
  from public.chat_members membership join public.chat_conversations conversation on conversation.id=membership.conversation_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('profile_id',member.profile_id,'profiles',jsonb_build_object('full_name',profile.full_name,'email',profile.email,'designation',profile.designation,'department',case when department.id is null then null else jsonb_build_object('name',department.name) end,'avatar_url',profile.avatar_url,'status',profile.status)) order by profile.full_name) members
    from public.chat_members member join public.profiles profile on profile.id=member.profile_id left join public.departments department on department.id=profile.department_id where member.conversation_id=membership.conversation_id
  ) member_rows on true
  left join lateral (
    select jsonb_build_object('id',message.id,'conversation_id',message.conversation_id,'body',message.body,'message_type',message.message_type,'voice_duration_seconds',message.voice_duration_seconds,'attachment_name',message.attachment_name,'created_at',message.created_at,'sender_id',message.sender_id) message
    from public.chat_messages message where message.conversation_id=membership.conversation_id and message.expired_at is null and message.deleted_at is null and message.message_type<>'system' order by message.created_at desc,message.id desc limit 1
  ) latest on true
  left join lateral (
    select count(*) total from public.chat_messages message where message.conversation_id=membership.conversation_id and message.sender_id<>auth.uid() and message.expired_at is null and message.deleted_at is null and message.message_type<>'system' and (membership.last_read_at is null or message.created_at>membership.last_read_at)
  ) unread on true
  where membership.profile_id=auth.uid()
  order by conversation.is_system_group desc,(conversation.conversation_type='group') desc,(latest.message->>'created_at')::timestamptz desc nulls last
$$;
