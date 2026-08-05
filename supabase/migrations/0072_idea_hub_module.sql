-- Internal Idea Hub module: submissions, supports, comments, categories, history, notifications, and RLS.
create table if not exists public.idea_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text,
 sort_order integer not null default 0,
 is_active boolean not null default true,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);

create table if not exists public.ideas (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(trim(title)) between 5 and 150),
 problem_or_opportunity text not null check(char_length(trim(problem_or_opportunity)) between 20 and 3000),
 proposed_solution text not null check(char_length(trim(proposed_solution)) between 20 and 5000),
 expected_benefit text not null check(char_length(trim(expected_benefit)) between 10 and 3000),
 category_id uuid not null references public.idea_categories(id),
 submitted_by uuid not null references public.profiles(id) on delete restrict,
 submitter_department_id uuid references public.departments(id) on delete set null,
 status text not null default 'Submitted' check(status in ('Submitted','Under Consideration','Implemented','On Hold','Not Proceeding','Archived')),
 status_note text,
 official_response text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 archived_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.idea_supports (
 id uuid primary key default gen_random_uuid(),
 idea_id uuid not null references public.ideas(id) on delete cascade,
 employee_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(idea_id, employee_id)
);

create table if not exists public.idea_comments (
 id uuid primary key default gen_random_uuid(),
 idea_id uuid not null references public.ideas(id) on delete cascade,
 author_employee_id uuid not null references public.profiles(id) on delete cascade,
 parent_comment_id uuid references public.idea_comments(id) on delete cascade,
 content text not null check(char_length(trim(content)) between 1 and 2000),
 is_official_response boolean not null default false,
 is_deleted boolean not null default false,
 deleted_at timestamptz,
 deleted_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.idea_attachments (
 id uuid primary key default gen_random_uuid(),
 idea_id uuid not null references public.ideas(id) on delete cascade,
 uploaded_by uuid not null references public.profiles(id) on delete restrict,
 original_file_name text not null,
 storage_key text not null unique,
 mime_type text not null,
 file_extension text not null,
 file_size integer not null check(file_size > 0 and file_size <= 20971520),
 checksum text,
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 deleted_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.idea_status_history (
 id uuid primary key default gen_random_uuid(),
 idea_id uuid not null references public.ideas(id) on delete cascade,
 previous_status text,
 new_status text not null,
 reason text,
 changed_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);

create table if not exists public.idea_activity_logs (
 id uuid primary key default gen_random_uuid(),
 idea_id uuid references public.ideas(id) on delete cascade,
 action_type text not null,
 actor_employee_id uuid references public.profiles(id) on delete set null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create index if not exists ideas_created_at_idx on public.ideas(created_at desc);
create index if not exists ideas_status_idx on public.ideas(status);
create index if not exists ideas_submitted_by_idx on public.ideas(submitted_by);
create index if not exists ideas_category_id_idx on public.ideas(category_id);
create index if not exists idea_comments_idea_id_idx on public.idea_comments(idea_id, created_at);
create index if not exists idea_supports_idea_id_idx on public.idea_supports(idea_id);
create index if not exists idea_status_history_idea_id_idx on public.idea_status_history(idea_id, created_at desc);
create index if not exists idea_activity_logs_idea_id_idx on public.idea_activity_logs(idea_id, created_at desc);

drop trigger if exists idea_categories_touch_updated_at on public.idea_categories;
create trigger idea_categories_touch_updated_at before update on public.idea_categories for each row execute function public.touch_updated_at();
drop trigger if exists ideas_touch_updated_at on public.ideas;
create trigger ideas_touch_updated_at before update on public.ideas for each row execute function public.touch_updated_at();
drop trigger if exists idea_comments_touch_updated_at on public.idea_comments;
create trigger idea_comments_touch_updated_at before update on public.idea_comments for each row execute function public.touch_updated_at();

insert into public.permissions(code, description) values
 ('ideas.view','View Idea Hub'),
 ('ideas.create','Submit Idea Hub ideas'),
 ('ideas.edit_own','Edit own submitted ideas'),
 ('ideas.comment','Comment on ideas'),
 ('ideas.support','Support ideas'),
 ('ideas.manage_status','Change Idea Hub statuses'),
 ('ideas.manage_categories','Manage Idea Hub categories'),
 ('ideas.moderate_comments','Moderate Idea Hub comments'),
 ('ideas.archive','Archive Idea Hub ideas'),
 ('ideas.view_reports','View Idea Hub statistics')
on conflict(code) do update set description=excluded.description;

do $$
begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
   insert into public.role_permissions(role_id, permission_id)
   select role.id, permission.id
   from public.roles role
   join public.permissions permission on
    (permission.code in ('ideas.view','ideas.create','ideas.edit_own','ideas.comment','ideas.support') and role.code in ('staff','general_manager','director','chairman','super_admin'))
    or (permission.code in ('ideas.manage_status','ideas.archive','ideas.view_reports') and role.code in ('general_manager','director','chairman','super_admin'))
    or (permission.code in ('ideas.manage_categories','ideas.moderate_comments') and role.code='super_admin')
   on conflict do nothing;
 end if;
end $$;

insert into public.idea_categories(name, description, sort_order)
select item.name, item.description, item.sort_order
from (values
 ('Process Improvement','Ideas that improve day-to-day workflow',10),
 ('Employee Welfare','Ideas that support employee wellbeing',20),
 ('Customer Experience','Ideas that improve client and patient experience',30),
 ('Sales and Marketing','Ideas for growth, campaigns, and lead handling',40),
 ('Technology','Ideas for systems, automation, and tools',50),
 ('Cost Reduction','Ideas that reduce avoidable spend',60),
 ('New Service','Ideas for new BSmile services',70),
 ('Workplace Improvement','Ideas for the office environment',80),
 ('Training and Development','Ideas for skills and learning',90),
 ('Other','Ideas that do not fit another category',100)
) as item(name, description, sort_order)
on conflict(name) do update set description=excluded.description, sort_order=excluded.sort_order;

create or replace function public.idea_is_visible(target uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.ideas idea where idea.id=target and idea.archived_at is null and public.has_permission('ideas.view'))
    or exists(select 1 from public.ideas idea where idea.id=target and idea.submitted_by=auth.uid() and public.has_permission('ideas.view'))
$$;

create or replace function public.enforce_idea_update_permissions()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status is distinct from old.status or new.status_note is distinct from old.status_note or new.official_response is distinct from old.official_response or new.archived_at is distinct from old.archived_at then
   if new.status = 'Not Proceeding' and char_length(trim(coalesce(new.status_note,''))) < 5 then
     raise exception 'A reason is required when an idea is marked Not Proceeding.';
   end if;
   if new.status is distinct from old.status and not public.has_permission('ideas.manage_status') then
     raise exception 'Permission denied for idea status changes.';
   end if;
   if new.archived_at is distinct from old.archived_at and not public.has_permission('ideas.archive') then
     raise exception 'Permission denied for idea archiving.';
   end if;
 elsif not (old.submitted_by=auth.uid() and old.status='Submitted' and public.has_permission('ideas.edit_own')) and not public.has_permission('ideas.manage_status') then
   raise exception 'Permission denied for idea editing.';
 end if;
 return new;
end $$;
drop trigger if exists ideas_update_permission_guard on public.ideas;
create trigger ideas_update_permission_guard before update on public.ideas for each row execute function public.enforce_idea_update_permissions();

create or replace function public.notify_idea_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
declare submitter uuid;
begin
 if TG_TABLE_NAME='ideas' and TG_OP='INSERT' then
   insert into public.idea_status_history(idea_id, previous_status, new_status, reason, changed_by) values(new.id, null, new.status, 'Idea submitted', new.submitted_by);
   insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.id, 'idea_submitted', new.submitted_by, jsonb_build_object('title', new.title));
   for recipient in select distinct id from public.profiles where status='active' and (role in ('general_manager','director','chairman','super_admin') or public.has_permission('ideas.manage_status', id)) loop
     if recipient.id is distinct from new.submitted_by then
       perform public.notify_user(recipient.id, 'New idea submitted', new.title, 'idea_submitted', new.id, '/admin/ideas/'||new.id, new.submitted_by);
     end if;
   end loop;
 elsif TG_TABLE_NAME='ideas' and TG_OP='UPDATE' then
   if new.status is distinct from old.status then
     insert into public.idea_status_history(idea_id, previous_status, new_status, reason, changed_by) values(new.id, old.status, new.status, new.status_note, auth.uid());
     insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.id, 'status_changed', auth.uid(), jsonb_build_object('previous_status', old.status, 'new_status', new.status, 'reason', new.status_note));
     perform public.notify_user(new.submitted_by, 'Idea status updated', new.title||' is now '||new.status||'.', 'idea_status_changed', new.id, '/employee/ideas/'||new.id, auth.uid());
   elsif new.official_response is distinct from old.official_response then
     insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.id, 'official_response_added', auth.uid(), jsonb_build_object('response', new.official_response));
     perform public.notify_user(new.submitted_by, 'Management responded to your idea', new.title, 'idea_official_response', new.id, '/employee/ideas/'||new.id, auth.uid());
   else
     insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.id, 'idea_edited', auth.uid(), jsonb_build_object('title', new.title));
   end if;
 end if;
 return new;
end $$;
drop trigger if exists idea_event_notification on public.ideas;
create trigger idea_event_notification after insert or update on public.ideas for each row execute function public.notify_idea_event();

create or replace function public.notify_idea_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid;
declare parent_author uuid;
begin
 insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.idea_id, case when new.is_official_response then 'official_response_added' else 'comment_added' end, new.author_employee_id, jsonb_build_object('comment_id', new.id, 'parent_comment_id', new.parent_comment_id));
 select submitted_by into owner from public.ideas where id=new.idea_id;
 if owner is not null and owner is distinct from new.author_employee_id then
   perform public.notify_user(owner, 'New comment on your idea', 'Someone commented on your Idea Hub submission.', 'idea_comment', new.idea_id, '/employee/ideas/'||new.idea_id, new.author_employee_id);
 end if;
 if new.parent_comment_id is not null then
   select author_employee_id into parent_author from public.idea_comments where id=new.parent_comment_id;
   if parent_author is not null and parent_author is distinct from new.author_employee_id and parent_author is distinct from owner then
     perform public.notify_user(parent_author, 'New reply on an idea', 'Someone replied to your Idea Hub comment.', 'idea_reply', new.idea_id, '/employee/ideas/'||new.idea_id, new.author_employee_id);
   end if;
 end if;
 return new;
end $$;
drop trigger if exists idea_comment_notification on public.idea_comments;
create trigger idea_comment_notification after insert on public.idea_comments for each row execute function public.notify_idea_comment();

create or replace function public.log_idea_support()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' then
   insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(new.idea_id, 'support_added', new.employee_id, '{}'::jsonb);
   return new;
 else
   insert into public.idea_activity_logs(idea_id, action_type, actor_employee_id, metadata) values(old.idea_id, 'support_removed', old.employee_id, '{}'::jsonb);
   return old;
 end if;
end $$;
drop trigger if exists idea_support_activity on public.idea_supports;
create trigger idea_support_activity after insert or delete on public.idea_supports for each row execute function public.log_idea_support();

insert into storage.buckets(id, name, public) values('idea-attachments','idea-attachments',false) on conflict(id) do update set public=false;

alter table public.idea_categories enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_supports enable row level security;
alter table public.idea_comments enable row level security;
alter table public.idea_attachments enable row level security;
alter table public.idea_status_history enable row level security;
alter table public.idea_activity_logs enable row level security;

grant select, insert, update, delete on public.idea_categories to authenticated;
grant select, insert, update, delete on public.ideas to authenticated;
grant select, insert, update, delete on public.idea_supports to authenticated;
grant select, insert, update on public.idea_comments to authenticated;
grant select, insert, update on public.idea_attachments to authenticated;
grant select, insert on public.idea_status_history to authenticated;
grant select, insert on public.idea_activity_logs to authenticated;

drop policy if exists "idea categories viewable" on public.idea_categories;
create policy "idea categories viewable" on public.idea_categories for select to authenticated using(deleted_at is null and (is_active or public.has_permission('ideas.manage_categories')));
drop policy if exists "idea categories managed" on public.idea_categories;
create policy "idea categories managed" on public.idea_categories for all to authenticated using(public.has_permission('ideas.manage_categories')) with check(public.has_permission('ideas.manage_categories'));

drop policy if exists "ideas readable" on public.ideas;
create policy "ideas readable" on public.ideas for select to authenticated using(public.has_permission('ideas.view') and (archived_at is null or public.has_permission('ideas.archive')));
drop policy if exists "ideas creatable" on public.ideas;
create policy "ideas creatable" on public.ideas for insert to authenticated with check(public.has_permission('ideas.create') and submitted_by=auth.uid() and status='Submitted' and archived_at is null and exists(select 1 from public.idea_categories c where c.id=category_id and c.is_active and c.deleted_at is null));
drop policy if exists "ideas editable" on public.ideas;
create policy "ideas editable" on public.ideas for update to authenticated using(public.has_permission('ideas.manage_status') or public.has_permission('ideas.archive') or (submitted_by=auth.uid() and status='Submitted' and public.has_permission('ideas.edit_own'))) with check(public.has_permission('ideas.manage_status') or public.has_permission('ideas.archive') or (submitted_by=auth.uid() and public.has_permission('ideas.edit_own')));

drop policy if exists "idea supports readable" on public.idea_supports;
create policy "idea supports readable" on public.idea_supports for select to authenticated using(public.idea_is_visible(idea_id));
drop policy if exists "idea supports own create" on public.idea_supports;
create policy "idea supports own create" on public.idea_supports for insert to authenticated with check(public.has_permission('ideas.support') and employee_id=auth.uid() and public.idea_is_visible(idea_id));
drop policy if exists "idea supports own delete" on public.idea_supports;
create policy "idea supports own delete" on public.idea_supports for delete to authenticated using(public.has_permission('ideas.support') and employee_id=auth.uid());

drop policy if exists "idea comments readable" on public.idea_comments;
create policy "idea comments readable" on public.idea_comments for select to authenticated using(public.idea_is_visible(idea_id));
drop policy if exists "idea comments create" on public.idea_comments;
create policy "idea comments create" on public.idea_comments for insert to authenticated with check(public.has_permission('ideas.comment') and author_employee_id=auth.uid() and public.idea_is_visible(idea_id) and (not is_official_response or public.has_permission('ideas.manage_status')));
drop policy if exists "idea comments update" on public.idea_comments;
create policy "idea comments update" on public.idea_comments for update to authenticated using((author_employee_id=auth.uid() and public.has_permission('ideas.comment')) or public.has_permission('ideas.moderate_comments')) with check((author_employee_id=auth.uid() and public.has_permission('ideas.comment')) or public.has_permission('ideas.moderate_comments'));

drop policy if exists "idea attachments readable" on public.idea_attachments;
create policy "idea attachments readable" on public.idea_attachments for select to authenticated using(deleted_at is null and public.idea_is_visible(idea_id));
drop policy if exists "idea attachments create" on public.idea_attachments;
create policy "idea attachments create" on public.idea_attachments for insert to authenticated with check(uploaded_by=auth.uid() and public.idea_is_visible(idea_id));
drop policy if exists "idea attachments update" on public.idea_attachments;
create policy "idea attachments update" on public.idea_attachments for update to authenticated using(uploaded_by=auth.uid() or public.has_permission('ideas.archive')) with check(uploaded_by=auth.uid() or public.has_permission('ideas.archive'));

drop policy if exists "idea status history readable" on public.idea_status_history;
create policy "idea status history readable" on public.idea_status_history for select to authenticated using(public.idea_is_visible(idea_id));
drop policy if exists "idea status history insertable" on public.idea_status_history;
create policy "idea status history insertable" on public.idea_status_history for insert to authenticated with check(public.has_permission('ideas.manage_status') or changed_by=auth.uid());

drop policy if exists "idea activity logs readable" on public.idea_activity_logs;
create policy "idea activity logs readable" on public.idea_activity_logs for select to authenticated using(public.has_permission('ideas.manage_status') or (idea_id is not null and public.idea_is_visible(idea_id)));
drop policy if exists "idea activity logs insertable" on public.idea_activity_logs;
create policy "idea activity logs insertable" on public.idea_activity_logs for insert to authenticated with check(actor_employee_id=auth.uid() or public.has_permission('ideas.manage_status') or public.has_permission('ideas.manage_categories'));

drop policy if exists "idea attachment uploads" on storage.objects;
create policy "idea attachment uploads" on storage.objects for insert to authenticated with check(bucket_id='idea-attachments' and owner_id=auth.uid()::text and public.has_permission('ideas.create'));
drop policy if exists "idea attachment reads" on storage.objects;
create policy "idea attachment reads" on storage.objects for select to authenticated using(bucket_id='idea-attachments' and exists(select 1 from public.idea_attachments attachment where attachment.storage_key=name and attachment.deleted_at is null and public.idea_is_visible(attachment.idea_id)));
