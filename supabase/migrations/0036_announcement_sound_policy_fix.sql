-- Announcements use the existing category field for urgency; there is no
-- announcement priority column.  Recreate the delivery function accordingly.
create or replace function public.notify_announcement_publish() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record; announcement_priority text := lower(coalesce(new.category,'normal'));
begin
  if new.status='published' and (TG_OP='INSERT' or old.status is distinct from 'published') then
    for recipient in select id from public.profiles p where new.audience_type='all' or (new.audience_type='department' and p.department_id=new.department_id) or (new.audience_type='employees' and exists(select 1 from public.announcement_recipients r where r.announcement_id=new.id and r.profile_id=p.id)) loop
      perform public.notify_user(recipient.id,'New announcement',new.title,'new_announcement',new.id,'/employee/announcements',new.author_id,'announcements',case when announcement_priority='urgent' then 'critical' else 'normal' end,case when announcement_priority='urgent' then 'critical' else 'none' end,announcement_priority='urgent');
    end loop;
  end if;
  return new;
end $$;
