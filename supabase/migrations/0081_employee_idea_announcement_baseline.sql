-- Company-wide employee Idea Hub access and read-only announcement delivery.
-- Management controls remain behind their existing manage permissions.

insert into public.permissions(code, description) values
  ('ideas.view', 'View Idea Hub'),
  ('ideas.create', 'Submit Idea Hub ideas'),
  ('ideas.support', 'Support ideas'),
  ('announcements.view', 'View employee announcements')
on conflict(code) do update set description = excluded.description;

do $$
declare
  employee_permissions text[] := array['ideas.view','ideas.create','ideas.support','announcements.view'];
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id'
  ) then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = any(employee_permissions)
    where coalesce(role.code, '') not in ('super_admin')
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role'
  ) then
    insert into public.role_permissions(role, permission_id)
    select baseline.role_name::public.employee_role, permission.id
    from (values
      ('Chairman'),
      ('Director'),
      ('General Manager'),
      ('Psychologist'),
      ('Staff'),
      ('Intern')
    ) as baseline(role_name)
    join public.permissions permission on permission.code = any(employee_permissions)
    on conflict do nothing;
  end if;
end $$;

drop policy if exists "announcements visible to audience" on public.announcements;
create policy "announcements visible to audience"
on public.announcements
for select
to authenticated
using (
  (
    public.has_permission('announcements.view')
    and status = 'published'
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
            and profile.status = 'active'
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

drop policy if exists "announcement reads own write" on public.announcement_reads;
create policy "announcement reads own write"
on public.announcement_reads
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1
    from public.announcements announcement
    where announcement.id = announcement_id
  )
);

drop policy if exists "announcement reads own update" on public.announcement_reads;
create policy "announcement reads own update"
on public.announcement_reads
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create or replace function public.notify_announcement_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
  announcement_priority text := lower(coalesce(new.category, 'normal'));
begin
  if new.status = 'published'
    and new.published_at <= now()
    and (new.expires_at is null or new.expires_at > now())
    and (TG_OP = 'INSERT' or old.status is distinct from 'published') then
    for recipient in
      select p.id
      from public.profiles p
      where p.status = 'active'
        and (
          new.audience_type = 'all'
          or (new.audience_type = 'department' and p.department_id = new.department_id)
          or (
            new.audience_type = 'employees'
            and exists (
              select 1
              from public.announcement_recipients selected
              where selected.announcement_id = new.id
                and selected.profile_id = p.id
            )
          )
        )
        and not exists (
          select 1
          from public.notifications notification
          where notification.profile_id = p.id
            and notification.related_entity_id = new.id
            and notification.type = 'new_announcement'
        )
    loop
      perform public.notify_user(
        recipient.id,
        'New announcement'::text,
        new.title,
        'new_announcement'::text,
        new.id,
        '/employee/announcements/' || new.id::text,
        new.author_id,
        'announcements'::text,
        case when announcement_priority = 'urgent' then 'critical' else 'normal' end,
        case when announcement_priority = 'urgent' then 'critical' else 'none' end,
        announcement_priority = 'urgent',
        jsonb_build_object('audience_type', new.audience_type, 'announcement_id', new.id)
      );
    end loop;
  end if;

  return new;
end $$;

create or replace function public.notify_selected_announcement_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement record;
  recipient_is_active boolean;
begin
  select *
  into announcement
  from public.announcements
  where id = new.announcement_id;

  select exists (
    select 1
    from public.profiles profile
    where profile.id = new.profile_id
      and profile.status = 'active'
  )
  into recipient_is_active;

  if recipient_is_active
    and announcement.id is not null
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
      '/employee/announcements/' || announcement.id::text,
      announcement.author_id,
      'announcements'::text,
      case when lower(coalesce(announcement.category, 'normal')) = 'urgent' then 'critical' else 'normal' end,
      case when lower(coalesce(announcement.category, 'normal')) = 'urgent' then 'critical' else 'none' end,
      lower(coalesce(announcement.category, 'normal')) = 'urgent',
      jsonb_build_object('audience_type', announcement.audience_type, 'announcement_id', announcement.id)
    );
  end if;

  return new;
end $$;

notify pgrst, 'reload schema';
