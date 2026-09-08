-- Task and other current triggers intentionally omit trailing notification
-- metadata. A partially replayed database can retain the 12-argument overload
-- without its defaults, making those legitimate trigger calls fail at runtime.
-- Re-declare the canonical function signature and body with all defaults intact.

create or replace function public.notify_user(
  target uuid,
  heading text,
  message text,
  kind text,
  entity uuid default null,
  link text default null,
  sender uuid default auth.uid(),
  notification_category text default 'system',
  notification_priority text default 'normal',
  notification_sound text default 'none',
  requires_action boolean default false,
  notification_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_entity_type text := coalesce(
    notification_metadata->>'entity_type',
    case when kind like 'leave_%' then 'leave_request' else null end
  );
begin
  if target is not null and target is distinct from sender then
    insert into public.notifications(
      profile_id, title, body, type, related_entity_id, deep_link, sender_id,
      category, priority, sound_type, sound_enabled, action_required, metadata,
      entity_type, entity_id, destination_url
    ) values (
      target, heading, message, kind, entity, link, sender,
      notification_category, notification_priority, notification_sound,
      notification_sound <> 'none', requires_action,
      coalesce(notification_metadata, '{}'::jsonb), resolved_entity_type,
      entity, link
    );
  end if;
end
$$;
