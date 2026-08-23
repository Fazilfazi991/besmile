-- Keep the legacy seven-argument internal helper for older database triggers,
-- but remove defaults from the richer twelve-argument overload.  Previously a
-- seven-argument internal call could also match the richer overload via its
-- defaults, making legitimate notification-triggered workflows fail with
-- SQLSTATE 42725 (ambiguous function call).  Both overloads remain private to
-- browser callers; this migration changes dispatch only, not authorization.
drop function public.notify_user(uuid, text, text, text, uuid, text, uuid, text, text, text, boolean, jsonb);

create or replace function public.notify_user(
  target uuid,
  heading text,
  message text,
  kind text,
  entity uuid,
  link text,
  sender uuid,
  notification_category text,
  notification_priority text,
  notification_sound text,
  requires_action boolean,
  notification_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target is not null and target is distinct from sender then
    insert into public.notifications(
      profile_id, title, body, type, related_entity_id, deep_link, sender_id,
      category, priority, sound_type, sound_enabled, action_required, metadata,
      entity_type, entity_id, destination_url
    )
    values (
      target, heading, message, kind, entity, link, sender,
      notification_category, notification_priority, notification_sound,
      notification_sound <> 'none', requires_action,
      coalesce(notification_metadata, '{}'::jsonb),
      coalesce(notification_metadata->>'entity_type', case when kind like 'leave_%' then 'leave_request' else null end),
      entity,
      coalesce(notification_metadata->>'destination_url', link)
    );
  end if;
end
$$;

revoke all on function public.notify_user(uuid, text, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text, uuid, text, uuid, text, text, text, boolean, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
