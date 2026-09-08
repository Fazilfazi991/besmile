-- The foundational tables predate the migrations that explicitly grant Data API
-- privileges. A database replay therefore had valid RLS policies but PostgreSQL
-- rejected authenticated access before those policies could run. Keep anonymous
-- access closed and restore only the application roles expected by the client and
-- server repositories.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'departments', 'roles', 'permissions', 'role_permissions', 'profiles',
    'audit_logs', 'employee_activity_logs',
    'attendance', 'attendance_breaks', 'company_attendance_settings', 'holidays',
    'leave_requests', 'leave_types', 'employee_leave_balances',
    'leave_request_attachments', 'leave_approval_events',
    'tasks', 'task_assignments', 'task_comments', 'task_attachments',
    'chat_conversations', 'chat_members', 'chat_messages', 'chat_message_reads',
    'notifications', 'documents', 'document_shares', 'document_requests',
    'document_submissions', 'announcements', 'announcement_recipients',
    'announcement_reads', 'user_permission_grants',
    'crm_lead_sources', 'crm_lead_statuses', 'crm_leads',
    'crm_lead_followups', 'crm_sales', 'crm_import_batches', 'crm_import_rows',
    'finance_accounts', 'finance_income_categories', 'finance_expense_categories',
    'finance_transactions', 'finance_invoices', 'finance_invoice_items',
    'finance_invoice_payments', 'employee_salary_settings', 'payroll_runs',
    'payroll_entries'
  ]
  loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relkind = 'r'
        and relation.relrowsecurity
    ) then
      raise exception 'Refusing Data API grant: public.% is missing or RLS is disabled', table_name;
    end if;
  end loop;
end
$$;

grant usage on schema public to authenticated, service_role;

grant select on table
  public.departments,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.profiles,
  public.audit_logs,
  public.employee_activity_logs,
  public.attendance,
  public.attendance_breaks,
  public.company_attendance_settings,
  public.holidays,
  public.leave_requests,
  public.leave_types,
  public.employee_leave_balances,
  public.leave_request_attachments,
  public.leave_approval_events,
  public.tasks,
  public.task_assignments,
  public.task_comments,
  public.task_attachments,
  public.chat_conversations,
  public.chat_members,
  public.chat_messages,
  public.chat_message_reads,
  public.notifications,
  public.documents,
  public.document_shares,
  public.document_requests,
  public.document_submissions,
  public.announcements,
  public.announcement_recipients,
  public.announcement_reads,
  public.user_permission_grants,
  public.crm_lead_sources,
  public.crm_lead_statuses,
  public.crm_leads,
  public.crm_lead_followups,
  public.crm_sales,
  public.crm_import_batches,
  public.crm_import_rows,
  public.finance_accounts,
  public.finance_income_categories,
  public.finance_expense_categories,
  public.finance_transactions,
  public.finance_invoices,
  public.finance_invoice_items,
  public.finance_invoice_payments,
  public.employee_salary_settings,
  public.payroll_runs,
  public.payroll_entries
to authenticated;

grant insert, update on table public.profiles to authenticated;

grant insert, update, delete on table
  public.attendance,
  public.attendance_breaks,
  public.company_attendance_settings,
  public.holidays,
  public.leave_requests,
  public.leave_types,
  public.employee_leave_balances,
  public.leave_request_attachments,
  public.leave_approval_events,
  public.tasks,
  public.task_assignments,
  public.task_comments,
  public.task_attachments,
  public.chat_conversations,
  public.chat_members,
  public.chat_messages,
  public.chat_message_reads,
  public.notifications,
  public.documents,
  public.document_shares,
  public.document_requests,
  public.document_submissions,
  public.announcements,
  public.announcement_recipients,
  public.announcement_reads,
  public.user_permission_grants,
  public.crm_lead_sources,
  public.crm_lead_statuses,
  public.crm_leads,
  public.crm_lead_followups,
  public.crm_sales,
  public.crm_import_batches,
  public.crm_import_rows,
  public.finance_accounts,
  public.finance_income_categories,
  public.finance_expense_categories,
  public.finance_transactions,
  public.finance_invoices,
  public.finance_invoice_items,
  public.finance_invoice_payments,
  public.employee_salary_settings,
  public.payroll_runs,
  public.payroll_entries
to authenticated;

grant insert, update, delete on table
  public.departments,
  public.roles,
  public.permissions,
  public.role_permissions
to authenticated;

grant all privileges on table
  public.departments,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.profiles,
  public.audit_logs,
  public.employee_activity_logs,
  public.attendance,
  public.attendance_breaks,
  public.company_attendance_settings,
  public.holidays,
  public.leave_requests,
  public.leave_types,
  public.employee_leave_balances,
  public.leave_request_attachments,
  public.leave_approval_events,
  public.tasks,
  public.task_assignments,
  public.task_comments,
  public.task_attachments,
  public.chat_conversations,
  public.chat_members,
  public.chat_messages,
  public.chat_message_reads,
  public.notifications,
  public.documents,
  public.document_shares,
  public.document_requests,
  public.document_submissions,
  public.announcements,
  public.announcement_recipients,
  public.announcement_reads,
  public.user_permission_grants,
  public.crm_lead_sources,
  public.crm_lead_statuses,
  public.crm_leads,
  public.crm_lead_followups,
  public.crm_sales,
  public.crm_import_batches,
  public.crm_import_rows,
  public.finance_accounts,
  public.finance_income_categories,
  public.finance_expense_categories,
  public.finance_transactions,
  public.finance_invoices,
  public.finance_invoice_items,
  public.finance_invoice_payments,
  public.employee_salary_settings,
  public.payroll_runs,
  public.payroll_entries
to service_role;

-- The employee-removal workflow intentionally prevents direct profile deletion.
revoke delete on table public.profiles from authenticated, anon;
