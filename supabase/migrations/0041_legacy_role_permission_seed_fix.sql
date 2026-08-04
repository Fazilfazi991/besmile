-- Correct role grants on projects that retain role_permissions(role, permission_id).
-- This is additive and does not reset or revoke any existing assignment.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='role_permissions' and column_name='role'
  ) then
    insert into public.role_permissions(role,permission_id)
    select seed.role_name::public.employee_role, permission.id
    from (values
      ('Chairman', array['dashboard.view','leads.view','leads.create','leads.edit','leads.assign','leads.manage_status','employees.view','employees.create','employees.edit','attendance.view','attendance.manage','leave.view','leave.manage','leave.approve','innovation.view','innovation.create','innovation.comment','innovation.manage','calendar.view','calendar.create','calendar.edit','calendar.manage','feedback.view','feedback.manage','members.view','members.manage','finance.dashboard.view','income.view','income.manage','expenses.view','expenses.manage','payroll.view','payroll.manage','invoices.view','invoices.manage','reports.finance.view','roles.view','roles.manage','permissions.view','permissions.manage','departments.manage','designations.manage','company_settings.manage']::text[]),
      ('Director', array['dashboard.view','leads.view','leads.create','leads.edit','leads.assign','leads.manage_status','employees.view','employees.create','employees.edit','attendance.view','attendance.manage','leave.view','leave.manage','leave.approve','innovation.view','innovation.create','innovation.comment','innovation.manage','calendar.view','calendar.create','calendar.edit','calendar.manage','feedback.view','feedback.manage','members.view','members.manage','finance.dashboard.view','income.view','income.manage','expenses.view','expenses.manage','payroll.view','payroll.manage','invoices.view','invoices.manage','reports.finance.view','roles.view','roles.manage','permissions.view','permissions.manage','departments.manage','designations.manage','company_settings.manage']::text[]),
      ('General Manager', array['dashboard.view','leads.view','leads.create','leads.edit','leads.assign','leads.manage_status','employees.view','employees.create','employees.edit','attendance.view','attendance.manage','leave.view','leave.manage','leave.approve','innovation.view','innovation.create','innovation.comment','innovation.manage','calendar.view','calendar.create','calendar.edit','calendar.manage','feedback.view','feedback.manage','members.view','members.manage','finance.dashboard.view','income.view','income.manage','expenses.view','expenses.manage','payroll.view','payroll.manage','invoices.view','invoices.manage','reports.finance.view','roles.view','roles.manage','permissions.view','permissions.manage','departments.manage','designations.manage','company_settings.manage']::text[]),
      ('Psychologist', array['innovation.view','innovation.create','innovation.comment','calendar.view','calendar.create','calendar.edit','feedback.view','patients.view','patients.create','patients.edit','patient_documents.view','patient_documents.upload','patient_documents.download','patient_notes.view','patient_notes.create','patient_notes.edit','clinical_notes.view','clinical_notes.create','clinical_notes.edit']::text[]),
      ('Intern', array['patient_documents.view','patient_documents.download']::text[]),
      ('Guest – Sales', array['leads.view','leads.edit','leads.manage_status','leads.documents.view','leads.documents.manage']::text[])
    ) as seed(role_name,permission_codes)
    join public.permissions permission on permission.code=any(seed.permission_codes)
    on conflict do nothing;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='role_permissions' and column_name='role_id'
  ) then
    insert into public.role_permissions(role_id,permission_id)
    select role.id, permission.id
    from public.roles role
    join public.permissions permission on
      (role.code in ('chairman','director','general_manager') and permission.code=any(array['dashboard.view','leads.view','leads.create','leads.edit','leads.assign','leads.manage_status','employees.view','employees.create','employees.edit','attendance.view','attendance.manage','leave.view','leave.manage','leave.approve','innovation.view','innovation.create','innovation.comment','innovation.manage','calendar.view','calendar.create','calendar.edit','calendar.manage','feedback.view','feedback.manage','members.view','members.manage','finance.dashboard.view','income.view','income.manage','expenses.view','expenses.manage','payroll.view','payroll.manage','invoices.view','invoices.manage','reports.finance.view','roles.view','roles.manage','permissions.view','permissions.manage','departments.manage','designations.manage','company_settings.manage']))
      or (role.code='psychologist' and permission.code=any(array['innovation.view','innovation.create','innovation.comment','calendar.view','calendar.create','calendar.edit','feedback.view','patients.view','patients.create','patients.edit','patient_documents.view','patient_documents.upload','patient_documents.download','patient_notes.view','patient_notes.create','patient_notes.edit','clinical_notes.view','clinical_notes.create','clinical_notes.edit']))
      or (role.code='intern' and permission.code=any(array['patient_documents.view','patient_documents.download']))
      or (role.code='guest_sales' and permission.code=any(array['leads.view','leads.edit','leads.manage_status','leads.documents.view','leads.documents.manage']))
    on conflict do nothing;
  end if;
end $$;
