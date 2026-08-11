-- notify_user has both a seven-argument overload and a longer overload whose
-- trailing arguments have defaults. Cast the literal arguments so Postgres
-- resolves the exact seven-argument function during message inserts.

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
begin
  for member in
    select cm.profile_id
    from public.chat_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.conversation_id = new.conversation_id
      and cm.profile_id <> new.sender_id
      and p.is_employee = true
      and p.status::text in ('active', 'intern', 'probation')
      and public.has_permission('chat.use', cm.profile_id)
  loop
    perform public.notify_user(
      member.profile_id,
      'New message'::text,
      (case
        when new.message_type = 'voice' then 'Voice message'
        else coalesce(nullif(new.body, ''), 'Attachment received')
      end)::text,
      'chat_message'::text,
      new.id,
      '/employee/chat'::text,
      new.sender_id,
      'system'::text,
      'normal'::text,
      'none'::text,
      false,
      '{}'::jsonb
    );
  end loop;
  return new;
end
$$;

revoke all on function public.notify_chat_message()
  from public, anon, authenticated;
