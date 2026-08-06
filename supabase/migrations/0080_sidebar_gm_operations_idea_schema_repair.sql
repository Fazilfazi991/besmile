-- Keep navigation permission bundles aligned with the production sidebar:
-- General Manager gets operational read access, not security administration
-- or employment-status authority. Idea Hub grants are repeated so an applied
-- schema repair exposes the required tables to PostgREST.
insert into public.permissions(code, description) values
  ('patients.view', 'View patient records'),
  ('documents.employee.manage', 'Manage operational employee documents'),
  ('ideas.view', 'View Idea Hub'),
  ('ideas.create', 'Submit Idea Hub ideas'),
  ('ideas.edit_own', 'Edit own submitted ideas'),
  ('ideas.comment', 'Comment on ideas'),
  ('ideas.support', 'Support ideas'),
  ('ideas.manage_categories', 'Manage Idea Hub categories')
on conflict(code) do update set description = excluded.description;

do $$
declare
  gm_allowed text[] := array[
    'admin.access','dashboard.view',
    'employees.view','patients.view',
    'documents.employee.manage',
    'ideas.view','ideas.create','ideas.edit_own','ideas.comment','ideas.support',
    'chat.use','announcements.manage','notifications.view',
    'tasks.assign','tasks.manage',
    'finance.dashboard.view','income.view','expenses.view','payroll.view','invoices.view','reports.finance.view',
    'leads.view','sales.view','crm.view_team'
  ];
  gm_removed text[] := array[
    'employees.create','employees.edit','employees.manage','employees.status.manage',
    'roles.view','roles.manage','permissions.view','permissions.manage',
    'tasks.manage_access','company_settings.manage','settings.manage','system.override',
    'protected_roles.manage','access_grants.view','access_grants.manage','security_audit.view'
  ];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = any(gm_allowed)
    where role.code = 'general_manager'
    on conflict do nothing;

    delete from public.role_permissions rp
    using public.roles role, public.permissions permission
    where rp.role_id = role.id
      and rp.permission_id = permission.id
      and role.code = 'general_manager'
      and permission.code = any(gm_removed);
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = any(gm_allowed)
    on conflict do nothing;

    delete from public.role_permissions rp
    using public.permissions permission
    where rp.permission_id = permission.id
      and trim(both '_' from regexp_replace(lower(rp.role::text), '[^a-z0-9]+', '_', 'g')) = 'general_manager'
      and permission.code = any(gm_removed);
  end if;
end $$;

-- Revoke direct protected grants from non-super-admin accounts, including any
-- historical grant that would make the GM see Manage Access or status actions.
update public.user_permission_grants grant_row
set revoked_at = coalesce(grant_row.revoked_at, now()),
    revoked_by = null,
    updated_at = now()
from public.profiles profile, public.permissions permission
where grant_row.profile_id = profile.id
  and grant_row.permission_id = permission.id
  and trim(both '_' from regexp_replace(lower(profile.role::text), '[^a-z0-9]+', '_', 'g')) <> 'super_admin'
  and permission.code in (
    'employees.manage','employees.status.manage',
    'roles.view','roles.manage','permissions.view','permissions.manage',
    'tasks.manage_access','company_settings.manage','settings.manage','system.override',
    'protected_roles.manage','access_grants.view','access_grants.manage','security_audit.view'
  )
  and grant_row.revoked_at is null;

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

drop policy if exists "idea supports readable" on public.idea_supports;
create policy "idea supports readable" on public.idea_supports for select to authenticated using(exists(select 1 from public.ideas idea where idea.id = idea_id and idea.archived_at is null and public.has_permission('ideas.view')));
drop policy if exists "idea supports own create" on public.idea_supports;
create policy "idea supports own create" on public.idea_supports for insert to authenticated with check(public.has_permission('ideas.support') and employee_id=auth.uid());
drop policy if exists "idea supports own delete" on public.idea_supports;
create policy "idea supports own delete" on public.idea_supports for delete to authenticated using(public.has_permission('ideas.support') and employee_id=auth.uid());

drop policy if exists "idea comments readable" on public.idea_comments;
create policy "idea comments readable" on public.idea_comments for select to authenticated using(exists(select 1 from public.ideas idea where idea.id = idea_id and idea.archived_at is null and public.has_permission('ideas.view')));
drop policy if exists "idea comments create" on public.idea_comments;
create policy "idea comments create" on public.idea_comments for insert to authenticated with check(public.has_permission('ideas.comment') and author_employee_id=auth.uid());

drop policy if exists "idea attachments readable" on public.idea_attachments;
create policy "idea attachments readable" on public.idea_attachments for select to authenticated using(deleted_at is null and exists(select 1 from public.ideas idea where idea.id = idea_id and idea.archived_at is null and public.has_permission('ideas.view')));
drop policy if exists "idea attachments create" on public.idea_attachments;
create policy "idea attachments create" on public.idea_attachments for insert to authenticated with check(uploaded_by=auth.uid() and exists(select 1 from public.ideas idea where idea.id = idea_id and idea.archived_at is null and public.has_permission('ideas.view')));
drop policy if exists "idea attachments update" on public.idea_attachments;
create policy "idea attachments update" on public.idea_attachments for update to authenticated using(uploaded_by=auth.uid() or public.has_permission('ideas.archive')) with check(uploaded_by=auth.uid() or public.has_permission('ideas.archive'));

drop policy if exists "idea status history readable" on public.idea_status_history;
create policy "idea status history readable" on public.idea_status_history for select to authenticated using(exists(select 1 from public.ideas idea where idea.id = idea_id and public.has_permission('ideas.view')));

drop policy if exists "idea activity logs readable" on public.idea_activity_logs;
create policy "idea activity logs readable" on public.idea_activity_logs for select to authenticated using(public.has_permission('ideas.manage_status') or (idea_id is not null and exists(select 1 from public.ideas idea where idea.id = idea_id and public.has_permission('ideas.view'))));
drop policy if exists "idea activity logs insertable" on public.idea_activity_logs;
create policy "idea activity logs insertable" on public.idea_activity_logs for insert to authenticated with check(actor_employee_id=auth.uid() or public.has_permission('ideas.manage_status') or public.has_permission('ideas.manage_categories'));

notify pgrst, 'reload schema';
