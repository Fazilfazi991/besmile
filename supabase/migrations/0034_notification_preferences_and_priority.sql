-- Notification delivery metadata and per-user preferences.  Existing notification
-- producers keep working because all new delivery fields have safe defaults.
alter table public.notifications
  add column if not exists category text not null default 'system',
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','medium','high','critical')),
  add column if not exists sound_type text not null default 'none' check (sound_type in ('none','success','standard','warning','critical')),
  add column if not exists sound_enabled boolean not null default false,
  add column if not exists action_required boolean not null default false,
  add column if not exists expires_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  notifications_enabled boolean not null default true,
  sounds_enabled boolean not null default false,
  desktop_enabled boolean not null default false,
  muted boolean not null default false,
  volume text not null default 'medium' check (volume in ('low','medium','high')),
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  critical_bypasses_quiet_hours boolean not null default true,
  category_settings jsonb not null default '{"chat":{"in_app":true,"sound":true,"desktop":false},"tasks":{"in_app":true,"sound":true,"desktop":false},"leave":{"in_app":true,"sound":true,"desktop":false},"attendance":{"in_app":true,"sound":false,"desktop":false},"crm":{"in_app":true,"sound":true,"desktop":false},"finance":{"in_app":true,"sound":true,"desktop":false},"documents":{"in_app":true,"sound":false,"desktop":false},"announcements":{"in_app":true,"sound":true,"desktop":false},"security":{"in_app":true,"sound":true,"desktop":false}}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists "notification preferences own" on public.notification_preferences;
create policy "notification preferences own" on public.notification_preferences for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at before update on public.notification_preferences for each row execute function public.touch_updated_at();

-- Centralise notification policy so database events cannot accidentally turn every
-- small update into a noisy alert.
create or replace function public.notify_user(
  target uuid, heading text, message text, kind text, entity uuid default null,
  link text default null, sender uuid default auth.uid(), notification_category text default 'system',
  notification_priority text default 'normal', notification_sound text default 'none',
  requires_action boolean default false, notification_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  if target is not null and target is distinct from sender then
    insert into public.notifications(profile_id,title,body,type,related_entity_id,deep_link,sender_id,category,priority,sound_type,sound_enabled,action_required,metadata)
    values(target,heading,message,kind,entity,link,sender,notification_category,notification_priority,notification_sound,notification_sound <> 'none',requires_action,coalesce(notification_metadata,'{}'::jsonb));
  end if;
end $$;

create or replace function public.notify_task_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.notify_user(new.profile_id,'Task assigned','You have been assigned a new task.','task_assigned',new.task_id,'/employee/tasks',auth.uid(),'tasks','high','standard',true);
  return new;
end $$;

create or replace function public.notify_leave_event() returns trigger language plpgsql security definer set search_path=public as $$
declare manager record;
begin
  if TG_OP='INSERT' then
    for manager in select id from public.profiles where role in ('chairman','director','general_manager') loop
      perform public.notify_user(manager.id,'New leave request','An employee submitted a leave request.','leave_submitted',new.id,'/admin/leaves',new.profile_id,'leave','high','standard',true);
    end loop;
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    perform public.notify_user(new.profile_id,'Leave request '||new.status,'Your leave request was '||new.status||'.','leave_'||new.status,new.id,'/employee/leaves',new.approver_id,'leave','high',case when new.status='approved' then 'success' else 'warning' end,true);
  end if;
  return new;
end $$;

create or replace function public.notify_announcement_publish() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; announcement_priority text := lower(coalesce(to_jsonb(new)->>'priority','normal'));
begin
  if new.status='published' and (TG_OP='INSERT' or old.status is distinct from 'published') then
    for recipient in select id from public.profiles p where new.audience_type='all' or (new.audience_type='department' and p.department_id=new.department_id) or (new.audience_type='employees' and exists(select 1 from public.announcement_recipients r where r.announcement_id=new.id and r.profile_id=p.id)) loop
      perform public.notify_user(recipient.id,'New announcement',new.title,'new_announcement',new.id,'/employee/announcements',new.author_id,'announcements',case when announcement_priority in ('urgent','critical') then 'critical' when announcement_priority='important' then 'high' else 'normal' end,case when announcement_priority in ('urgent','critical') then 'critical' when announcement_priority='important' then 'standard' else 'none' end,announcement_priority in ('urgent','critical'));
    end loop;
  end if;
  return new;
end $$;

create or replace function public.notify_chat_message() returns trigger language plpgsql security definer set search_path=public as $$
declare member record;
begin
  for member in select profile_id from public.chat_members where conversation_id=new.conversation_id and profile_id<>new.sender_id loop
    perform public.notify_user(member.profile_id,'New message',coalesce(new.body,'Attachment received'),'chat_message',new.id,'/employee/chat',new.sender_id,'chat','medium','standard',false,jsonb_build_object('conversation_id',new.conversation_id));
  end loop;
  return new;
end $$;

create or replace function public.notify_crm_lead_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.assigned_to is not null and (TG_OP='INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform public.notify_user(new.assigned_to,'Lead assigned','A new CRM lead has been assigned to you.','crm_lead_assigned',new.id,'/employee/crm/leads/'||new.id,new.created_by,'crm','high','standard',true);
  end if;
  return new;
end $$;
drop trigger if exists crm_lead_assignment_notification on public.crm_leads;
create trigger crm_lead_assignment_notification after insert or update of assigned_to on public.crm_leads for each row execute function public.notify_crm_lead_assignment();

alter publication supabase_realtime add table public.notifications;
