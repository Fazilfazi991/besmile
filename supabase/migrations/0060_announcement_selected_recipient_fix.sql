-- Selected-employee announcements are created in two steps by the app:
-- announcement first, recipients second. Allow authorized announcement
-- managers to insert recipient rows, and notify recipients when they are added
-- to an already-published announcement.

drop policy if exists "announcements visible to audience" on public.announcements;
create policy "announcements visible to audience"
on public.announcements
for select
to authenticated
using (
  (
    status = 'published'
    and published_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      audience_type = 'all'
      or (
        audience_type = 'department'
        and department_id = (
          select profile.department_id
          from public.profiles profile
          where profile.id = auth.uid()
        )
      )
      or (
        audience_type = 'employees'
        and exists (
          select 1
          from public.announcement_recipients recipient
          where recipient.announcement_id = announcements.id
            and recipient.profile_id = auth.uid()
        )
      )
    )
  )
  or public.has_permission('announcements.manage')
);

drop policy if exists "announcements manager write" on public.announcements;
create policy "announcements manager write"
on public.announcements
for all
to authenticated
using (public.has_permission('announcements.manage'))
with check (public.has_permission('announcements.manage'));

drop policy if exists "announcement recipients manager write" on public.announcement_recipients;
create policy "announcement recipients manager write"
on public.announcement_recipients
for all
to authenticated
using (public.has_permission('announcements.manage'))
with check (public.has_permission('announcements.manage'));

drop policy if exists "announcement recipients own or management" on public.announcement_recipients;
create policy "announcement recipients own or management"
on public.announcement_recipients
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.has_permission('announcements.manage')
);

create or replace function public.notify_selected_announcement_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement record;
begin
  select *
  into announcement
  from public.announcements
  where id = new.announcement_id;

  if announcement.id is not null
    and announcement.status = 'published'
    and announcement.audience_type = 'employees'
    and announcement.published_at <= now()
    and (announcement.expires_at is null or announcement.expires_at > now())
    and not exists (
      select 1
      from public.notifications notification
      where notification.profile_id = new.profile_id
        and notification.related_entity_id = announcement.id
        and notification.type = 'new_announcement'
    ) then
    perform public.notify_user(
      new.profile_id,
      'New announcement'::text,
      announcement.title,
      'new_announcement'::text,
      announcement.id,
      '/employee/announcements'::text,
      announcement.author_id,
      'announcements'::text,
      'normal'::text,
      'none'::text,
      false,
      jsonb_build_object('audience_type', announcement.audience_type)
    );
  end if;

  return new;
end $$;

drop trigger if exists selected_announcement_recipient_notification on public.announcement_recipients;
create trigger selected_announcement_recipient_notification
after insert on public.announcement_recipients
for each row execute function public.notify_selected_announcement_recipient();
