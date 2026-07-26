-- Super Admin-first control layer. Run only after 0020 has committed.
insert into public.roles(code,name) values ('super_admin','Super Admin')
on conflict(code) do update set name=excluded.name;

insert into public.permissions(code,description) values
  ('admin.access','Open the Super Admin workspace'),
  ('employees.view','View employees'),('employees.manage','Manage employees'),
  ('attendance.view_self','View own attendance'),('attendance.view_team','View team attendance'),('attendance.manage','Manage attendance'),
  ('leave.request','Create leave requests'),('leave.review','Review leave requests'),
  ('tasks.view_self','View assigned tasks'),('tasks.assign','Create and assign tasks'),('tasks.manage_access','Manage task assignment access'),
  ('documents.view','View accessible documents'),('documents.manage','Manage documents and requests'),
  ('announcements.view','View announcements'),('announcements.manage','Manage announcements'),
  ('notifications.view','View notifications'),('chat.use','Use chat'),
  ('crm.view_assigned','View assigned CRM records'),('crm.view_team','View team CRM records'),('crm.manage_all','Manage all CRM records'),('crm.import','Import CRM workbooks'),
  ('finance.view','View finance data'),('finance.manage','Manage finance data'),('payroll.view','View payroll'),('payroll.manage','Manage payroll'),
  ('invoices.view','View invoices'),('invoices.manage','Manage invoices'),('reports.view','View reports'),
  ('roles.manage','Manage roles'),('permissions.manage','Manage role permissions'),('audit.view','View audit logs'),('settings.manage','Manage company settings')
on conflict(code) do update set description=excluded.description;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='role_permissions' and column_name='role_id') then
    insert into public.role_permissions(role_id,permission_id)
    select r.id,p.id from public.roles r cross join public.permissions p
    where (r.code in ('chairman','director') and p.code in (
      'admin.access','employees.view','employees.manage','attendance.view_team','attendance.manage','leave.review',
      'tasks.assign','tasks.manage_access','documents.manage','announcements.manage','crm.manage_all','crm.import',
      'reports.view','roles.manage','permissions.manage','audit.view','settings.manage'))
       or (r.code='general_manager' and p.code in ('attendance.view_team','leave.review','tasks.assign','documents.manage','announcements.manage','crm.view_team','reports.view'))
    on conflict do nothing;
  end if;
end $$;

create or replace function public.is_super_admin(subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=subject_id and p.status='active' and p.role='super_admin')
$$;

create or replace function public.is_management()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_role() in ('super_admin','chairman','director')
$$;

create or replace function public.can_manage_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or public.has_permission('admin.access')
$$;

create or replace function public.has_permission(permission_code text, subject_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles subject
    where subject.id=subject_id and subject.status='active' and (
      subject.role='super_admin'
      or public.role_has_permission(subject.role,permission_code)
      or exists(select 1 from public.user_permission_grants g join public.permissions p on p.id=g.permission_id where g.profile_id=subject.id and p.code=permission_code and g.revoked_at is null and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now()))
    )
  )
$$;

create index if not exists user_permission_grants_active_lookup_idx on public.user_permission_grants(profile_id, starts_at, expires_at) where revoked_at is null;

drop policy if exists "permission grants readable by subject or manager" on public.user_permission_grants;
drop policy if exists "permission grants managed by authorized users" on public.user_permission_grants;
create policy "permission grants readable by subject or access manager" on public.user_permission_grants for select to authenticated using (profile_id=auth.uid() or public.has_permission('roles.manage') or public.has_permission('permissions.manage'));
create policy "permission grants managed by access managers" on public.user_permission_grants for all to authenticated using (public.has_permission('roles.manage') or public.has_permission('permissions.manage')) with check (public.has_permission('roles.manage') or public.has_permission('permissions.manage'));

drop policy if exists "profiles edited by management or self" on public.profiles;
create policy "profiles edited by management or self" on public.profiles for update to authenticated using (public.has_permission('employees.manage') or id=auth.uid() or (public.current_role()='general_manager' and public.in_management_tree(id))) with check (public.has_permission('employees.manage') or id=auth.uid() or (public.current_role()='general_manager' and public.in_management_tree(id)));

drop policy if exists "notifications are private" on public.notifications;
create policy "notifications private or organization access" on public.notifications for all to authenticated using (profile_id=auth.uid() or public.has_permission('admin.access')) with check (profile_id=auth.uid() or public.has_permission('admin.access'));

create or replace function public.leave_employee_can_manage(requester uuid) returns boolean language sql stable security definer set search_path=public as $$ select requester=auth.uid() or public.has_permission('leave.review') or (public.current_role()='general_manager' and public.in_management_tree(requester)) $$;
create or replace function public.document_manager_can_manage(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.has_permission('documents.manage') or (public.current_role()='general_manager' and public.in_management_tree(target)) $$;
create or replace function public.announcement_manager_can_manage(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.has_permission('announcements.manage') or (public.current_role()='general_manager' and (target is null or public.in_management_tree(target))) $$;
create or replace function public.crm_can_manage(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.has_permission('crm.manage_all') or (public.has_permission('crm.view_team') and public.in_management_tree(target)) $$;

drop policy if exists "attendance own or hierarchy" on public.attendance;
create policy "attendance self team or manager access" on public.attendance for all to authenticated using (profile_id=auth.uid() or public.has_permission('attendance.manage') or (public.has_permission('attendance.view_team') and public.in_management_tree(profile_id))) with check (profile_id=auth.uid() or public.has_permission('attendance.manage') or (public.has_permission('attendance.view_team') and public.in_management_tree(profile_id)));

comment on function public.has_permission(text,uuid) is 'Route map: /admin=admin.access; /admin/tasks=tasks.assign; /admin/task-access=tasks.manage_access; /admin/documents=documents.manage; /admin/announcements=announcements.manage; /admin/crm=crm.manage_all; /admin/crm/import=crm.import; /admin/notifications=notifications.view; /admin/access=roles.manage or permissions.manage; employee pages remain self-service and record-scoped by RLS.';
