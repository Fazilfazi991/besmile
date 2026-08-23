-- Preserve the historical notification but prevent a dead active-announcement link.
create or replace function public.mark_archived_announcement_notifications()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='archived' and old.status is distinct from 'archived' then
    update public.notifications set title='Announcement archived', body=coalesce(body,new.title)||' is no longer active.', deep_link=null
    where type='new_announcement' and related_entity_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.mark_archived_announcement_notifications() from public;
drop trigger if exists announcement_notification_archive_lifecycle on public.announcements;
create trigger announcement_notification_archive_lifecycle after update of status on public.announcements for each row execute function public.mark_archived_announcement_notifications();
