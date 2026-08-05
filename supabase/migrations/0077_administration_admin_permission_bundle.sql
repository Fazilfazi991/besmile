-- Reusable Administration Admin access bundle.
-- Diya remains the same staff auth/profile record; permissions come from her
-- Administration department + Admin designation rather than from her email.

insert into public.permissions(code, description) values
  ('admin.shell', 'Open permitted operational admin tools'),
  ('crm.delete', 'Permanently delete CRM records'),
  ('patients.assign', 'Assign clinicians and care-team members to patients'),
  ('documents.operational_client.manage', 'Manage operational client documents'),
  ('profile.manage_own', 'Manage own profile'),
  ('ideas.view', 'View Idea Hub'),
  ('ideas.create', 'Submit Idea Hub ideas'),
  ('ideas.edit_own', 'Edit own submitted ideas'),
  ('ideas.comment', 'Comment on ideas'),
  ('ideas.support', 'Support ideas')
on conflict(code) do update set description = excluded.description;

create table if not exists public.designation_permission_bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  department_name text not null,
  designation text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(department_name, designation)
);

create table if not exists public.designation_permission_bundle_permissions (
  bundle_id uuid not null references public.designation_permission_bundles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(bundle_id, permission_id)
);

alter table public.designation_permission_bundles enable row level security;
alter table public.designation_permission_bundle_permissions enable row level security;

drop policy if exists "designation bundles readable by authenticated users" on public.designation_permission_bundles;
create policy "designation bundles readable by authenticated users"
on public.designation_permission_bundles for select to authenticated
using(true);

drop policy if exists "designation bundle permissions readable by authenticated users" on public.designation_permission_bundle_permissions;
create policy "designation bundle permissions readable by authenticated users"
on public.designation_permission_bundle_permissions for select to authenticated
using(true);

drop policy if exists "designation bundles managed by security admins" on public.designation_permission_bundles;
create policy "designation bundles managed by security admins"
on public.designation_permission_bundles for all to authenticated
using(public.has_permission('roles.manage') or public.has_permission('permissions.manage'))
with check(public.has_permission('roles.manage') or public.has_permission('permissions.manage'));

drop policy if exists "designation bundle permissions managed by security admins" on public.designation_permission_bundle_permissions;
create policy "designation bundle permissions managed by security admins"
on public.designation_permission_bundle_permissions for all to authenticated
using(public.has_permission('roles.manage') or public.has_permission('permissions.manage'))
with check(public.has_permission('roles.manage') or public.has_permission('permissions.manage'));

insert into public.designation_permission_bundles(name, department_name, designation, is_active)
values ('Administration Admin', 'Administration', 'Admin', true)
on conflict(name) do update
set department_name = excluded.department_name,
    designation = excluded.designation,
    is_active = true,
    updated_at = now();

with bundle as (
  select id from public.designation_permission_bundles where name = 'Administration Admin'
), allowed_permissions as (
  select permission.id
  from public.permissions permission
  where permission.code = any(array[
    'admin.shell',
    'dashboard.view',
    'crm.manage_all',
    'leads.view','leads.create','leads.edit','leads.assign','leads.manage_status',
    'sales.view','sales.edit','sales.manage_status','sales.documents.view','sales.documents.manage',
    'clients.view','clients.create','clients.edit','clients.documents.view','clients.documents.manage',
    'employees.view','employees.create','employees.edit','employees.documents.view','employees.documents.manage',
    'patients.view','patients.view_all','patients.create','patients.edit','patients.assign',
    'patient_documents.view','patient_documents.upload','patient_documents.download','patient_documents.archive',
    'patient_activity.view',
    'attendance.view',
    'leave.self','leave.request','leave.view',
    'tasks.view_self','tasks.assign',
    'documents.view','documents.employee.view','documents.employee.manage','documents.administration.view','documents.administration.manage',
    'documents.client.view','documents.client.manage','documents.appointment.view','documents.appointment.manage',
    'documents.identity.view','documents.operational_client.manage',
    'announcements.view',
    'notifications.view','chat.use','profile.manage_own',
    'calendar.view','calendar.create','calendar.edit',
    'feedback.view','feedback.manage','members.view','members.manage',
    'ideas.view','ideas.create','ideas.edit_own','ideas.comment','ideas.support'
  ])
)
insert into public.designation_permission_bundle_permissions(bundle_id, permission_id)
select bundle.id, allowed_permissions.id
from bundle cross join allowed_permissions
on conflict do nothing;

delete from public.designation_permission_bundle_permissions bundle_permission
using public.designation_permission_bundles bundle, public.permissions permission
where bundle_permission.bundle_id = bundle.id
  and bundle_permission.permission_id = permission.id
  and bundle.name = 'Administration Admin'
  and permission.code = any(array[
    'finance.view','finance.manage','finance.dashboard.view',
    'income.view','income.manage','expenses.view','expenses.manage',
    'payroll.view','payroll.manage','invoices.view','invoices.manage',
    'reports.view','reports.finance.view',
    'roles.view','roles.manage','permissions.view','permissions.manage',
    'settings.manage','company_settings.manage','audit.view',
    'leave.approve','leave.manage','leave.review',
    'clinical_notes.view','clinical_notes.create','clinical_notes.edit','clinical_notes.delete',
    'patient_notes.edit','patient_notes.delete',
    'patients.delete','employees.delete','crm.delete'
  ]);

update public.profiles profile
set role = 'staff'::public.app_role,
    designation = 'Admin',
    department_id = coalesce((
      select department.id from public.departments department where department.name = 'Administration' limit 1
    ), profile.department_id),
    manager_id = coalesce((
      select manager.id
      from public.profiles manager
      where lower(manager.email) = 'bsmile.gm@gmail.com'
         or manager.employee_code = 'A001'
      order by case when manager.employee_code = 'A001' then 0 else 1 end, manager.created_at
      limit 1
    ), profile.manager_id),
    updated_at = now()
where lower(profile.email) = 'diyaadminbsmile@gmail.com'
  and profile.employee_code = 'A002';

create or replace function public.has_permission(permission_code text, subject_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles subject
    left join public.departments department on department.id = subject.department_id
    where subject.id = subject_id
      and subject.status = 'active'
      and (
        subject.role = 'super_admin'
        or public.role_has_permission(subject.role, permission_code)
        or exists (
          select 1
          from public.user_permission_grants grant_row
          join public.permissions permission on permission.id = grant_row.permission_id
          where grant_row.profile_id = subject.id
            and permission.code = permission_code
            and grant_row.revoked_at is null
            and grant_row.starts_at <= now()
            and (grant_row.expires_at is null or grant_row.expires_at > now())
        )
        or exists (
          select 1
          from public.designation_permission_bundles bundle
          join public.designation_permission_bundle_permissions bundle_permission on bundle_permission.bundle_id = bundle.id
          join public.permissions permission on permission.id = bundle_permission.permission_id
          where bundle.is_active
            and permission.code = permission_code
            and lower(bundle.department_name) = lower(coalesce(department.name, ''))
            and lower(bundle.designation) = lower(coalesce(subject.designation, ''))
        )
      )
  )
$$;

create or replace function public.profile_role_is_protected(role_code text)
returns boolean
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(lower(coalesce(role_code, '')), '[^a-z0-9]+', '_', 'g'))
    in ('super_admin','chairman','director','general_manager')
$$;

create or replace function public.profile_can_operationally_edit(target uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles target_profile
    where target_profile.id = target
      and (
        auth.uid() = target_profile.id
        or public.has_permission('employees.manage')
        or (
          public.has_permission('employees.edit')
          and not public.profile_role_is_protected(target_profile.role::text)
        )
        or (
          public.current_role() = 'general_manager'
          and public.in_management_tree(target_profile.id)
        )
      )
  )
$$;

drop policy if exists "profiles edited by management or self" on public.profiles;
create policy "profiles edited by management or self"
on public.profiles for update to authenticated
using(public.profile_can_operationally_edit(id))
with check(public.profile_can_operationally_edit(id));

drop policy if exists "profiles readable by authorized users" on public.profiles;
create policy "profiles readable by authorized users"
on public.profiles for select to authenticated
using(id = auth.uid() or public.has_permission('employees.view') or public.has_permission('employees.manage'));

drop policy if exists "crm leads scoped delete" on public.crm_leads;
create policy "crm leads scoped delete"
on public.crm_leads for delete to authenticated
using(public.has_permission('crm.delete'));

drop policy if exists "crm sales scoped delete" on public.crm_sales;
create policy "crm sales scoped delete"
on public.crm_sales for delete to authenticated
using(public.has_permission('crm.delete'));

create or replace function public.leave_employee_can_manage(requester uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select requester = auth.uid()
    or public.has_permission('leave.view')
    or public.has_permission('leave.review')
    or public.has_permission('leave.approve')
    or (
      public.current_role() = 'general_manager'
      and public.in_management_tree(requester)
    )
$$;

drop policy if exists "leave management updates" on public.leave_requests;
create policy "leave management updates"
on public.leave_requests for update to authenticated
using(
  (public.has_permission('leave.approve') or public.has_permission('leave.manage') or (
    public.current_role() = 'general_manager' and public.in_management_tree(profile_id)
  ))
  and profile_id <> auth.uid()
)
with check(
  (public.has_permission('leave.approve') or public.has_permission('leave.manage') or (
    public.current_role() = 'general_manager' and public.in_management_tree(profile_id)
  ))
  and profile_id <> auth.uid()
);

drop policy if exists "attendance self team or manager access" on public.attendance;
drop policy if exists "attendance self team or manager read" on public.attendance;
drop policy if exists "attendance self team or manager write" on public.attendance;
create policy "attendance self team or manager read"
on public.attendance for select to authenticated
using(
  profile_id = auth.uid()
  or public.has_permission('attendance.view')
  or public.has_permission('attendance.manage')
  or (
    public.has_permission('attendance.view_team')
    and public.in_management_tree(profile_id)
  )
);

create policy "attendance self team or manager write"
on public.attendance for all to authenticated
using(
  profile_id = auth.uid()
  or public.has_permission('attendance.manage')
  or (
    public.has_permission('attendance.view_team')
    and public.in_management_tree(profile_id)
  )
)
with check(
  profile_id = auth.uid()
  or public.has_permission('attendance.manage')
  or (
    public.has_permission('attendance.view_team')
    and public.in_management_tree(profile_id)
  )
);

comment on table public.designation_permission_bundles is 'Reusable department/designation permission bundles; Administration Admin grants Diya operational access without changing her staff role.';
