-- Ensure General Manager has the management workspace grants in both supported
-- role_permissions schemas. This migration is additive and intentionally omits
-- client identity, clinical, session, and appointment record permissions.
insert into public.permissions(code, description) values
  ('clients.view', 'View clients'), ('clients.create', 'Create clients'),
  ('clients.edit', 'Edit clients'), ('clients.assign', 'Assign clients')
on conflict (code) do update set description = excluded.description;

do $$
declare
  management_permissions text[] := array[
    'admin.access','dashboard.view',
    'leads.view','leads.create','leads.edit','leads.assign','leads.manage_status',
    'clients.view','clients.create','clients.edit','clients.assign',
    'employees.view','employees.create','employees.edit',
    'attendance.view','attendance.manage','leave.view','leave.manage','leave.approve',
    'tasks.assign','tasks.manage_access','documents.manage',
    'documents.employee.view','documents.employee.manage',
    'documents.psychologist.view','documents.psychologist.manage',
    'documents.intern.view','documents.intern.manage',
    'documents.administration.view','documents.administration.manage',
    'documents.agreements.view','documents.agreements.manage',
    'documents.certifications.view','documents.certifications.manage',
    'innovation.view','innovation.create','innovation.comment','innovation.manage',
    'calendar.view','calendar.create','calendar.edit','calendar.manage',
    'feedback.view','feedback.manage','members.view','members.manage',
    'finance.dashboard.view','income.view','income.manage','expenses.view','expenses.manage',
    'payroll.view','payroll.manage','invoices.view','invoices.manage','reports.finance.view',
    'announcements.manage','notifications.view','chat.use',
    'roles.view','roles.manage','permissions.view','permissions.manage',
    'departments.manage','designations.manage','company_settings.manage'
  ];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role_id') then
    insert into public.role_permissions(role_id, permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on permission.code = any(management_permissions)
    where role.code = 'general_manager'
    on conflict do nothing;
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'role_permissions' and column_name = 'role') then
    insert into public.role_permissions(role, permission_id)
    select 'General Manager'::public.employee_role, permission.id
    from public.permissions permission
    where permission.code = any(management_permissions)
    on conflict do nothing;
  end if;
end $$;
