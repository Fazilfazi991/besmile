-- Patient source metadata and actionable leave notification deep links.

alter table public.notifications
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists destination_url text;

update public.notifications
set entity_type = coalesce(entity_type, case when type like 'leave_%' then 'leave_request' else null end),
    entity_id = coalesce(entity_id, related_entity_id),
    destination_url = coalesce(destination_url, deep_link)
where entity_id is null or destination_url is null or entity_type is null;

update public.notifications
set deep_link = case
    when type = 'leave_submitted' then '/admin/leaves?request=' || related_entity_id::text
    when type in ('leave_approved','leave_rejected') then '/employee/leaves?request=' || related_entity_id::text
    else deep_link
  end,
  destination_url = case
    when type = 'leave_submitted' then '/admin/leaves?request=' || related_entity_id::text
    when type in ('leave_approved','leave_rejected') then '/employee/leaves?request=' || related_entity_id::text
    else destination_url
  end,
  entity_type = 'leave_request',
  entity_id = related_entity_id
where type in ('leave_submitted','leave_approved','leave_rejected')
  and related_entity_id is not null;

create or replace function public.notify_user(
  target uuid, heading text, message text, kind text, entity uuid default null,
  link text default null, sender uuid default auth.uid(), notification_category text default 'system',
  notification_priority text default 'normal', notification_sound text default 'none',
  requires_action boolean default false, notification_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare resolved_entity_type text := coalesce(notification_metadata->>'entity_type', case when kind like 'leave_%' then 'leave_request' else null end);
begin
  if target is not null and target is distinct from sender then
    insert into public.notifications(profile_id,title,body,type,related_entity_id,deep_link,sender_id,category,priority,sound_type,sound_enabled,action_required,metadata,entity_type,entity_id,destination_url)
    values(target,heading,message,kind,entity,link,sender,notification_category,notification_priority,notification_sound,notification_sound <> 'none',requires_action,coalesce(notification_metadata,'{}'::jsonb),resolved_entity_type,entity,link);
  end if;
end $$;

create or replace function public.notify_leave_event() returns trigger language plpgsql security definer set search_path=public as $$
declare manager record;
begin
  if TG_OP='INSERT' then
    for manager in select id from public.profiles where role in ('super_admin','chairman','director','general_manager') loop
      perform public.notify_user(manager.id,'New leave request','An employee submitted a leave request.','leave_submitted',new.id,'/admin/leaves?request='||new.id::text,new.profile_id,'leave','high','standard',true,jsonb_build_object('entity_type','leave_request','destination_url','/admin/leaves?request='||new.id::text));
    end loop;
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    perform public.notify_user(new.profile_id,'Leave request '||new.status,'Your leave request was '||new.status||'.','leave_'||new.status,new.id,'/employee/leaves?request='||new.id::text,new.approver_id,'leave','high',case when new.status='approved' then 'success' else 'warning' end,true,jsonb_build_object('entity_type','leave_request','destination_url','/employee/leaves?request='||new.id::text));
  end if;
  return new;
end $$;
