# BSmile CRM migration checklist

Apply every migration once, in lexical order, to a fresh production project. The connected QA project was verified through `0030`; production status remains **pending** until the operator records each application below.

| Order | Migration | Purpose | Production status | Verification / rollback note |
| --- | --- | --- | --- | --- |
| 0001 | `0001_bsmile_auth_foundation.sql` | Profiles, base roles, auth helpers, foundational RLS | Pending | Verify `profiles`, `current_role`, `in_management_tree`; foundational, roll forward only. |
| 0002 | `0002_admin_management.sql` | Admin structures, audit helpers, departments/designations | Pending | Verify audit triggers and management policies. |
| 0003 | `0003_employee_workspace.sql` | Employee workspace policies | Pending | Verify attendance/comments/documents policy behaviour. |
| 0004 | `0004_attendance_rules.sql` | Attendance settings/holidays | Pending | Verify readable settings and holidays. |
| 0005 | `0005_attendance_timezone_ist.sql` | Attendance timezone handling | Pending | Verify company timezone and date calculation. |
| 0006 | `0006_employee_leave_management.sql` | Leave schema, lifecycle, RLS, attachments | Pending | Verify employee create/manager review; no destructive rollback. |
| 0007 | `0007_tasks_mvp.sql` | Multi-assignee task foundation | Pending | Superseded policies are later reset; keep order. |
| 0008 | `0008_documents_mvp.sql` | Documents schema/storage policies | Pending | Verify private bucket and recipient isolation. |
| 0009 | `0009_announcements_mvp.sql` | Announcements/read receipts | Pending | Verify targeted audience reads. |
| 0010 | `0010_notifications_mvp.sql` | In-app notifications | Pending | Verify recipient isolation and triggers. |
| 0011 | `0011_employee_profile_mvp.sql` | Profile data/photo policies | Pending | Verify self-edit restriction. |
| 0012 | `0012_internal_chat_mvp.sql` | Chat, attachments, realtime policies | Pending | Verify conversation membership isolation. |
| 0013 | `0013_leads_sales_crm.sql` | Leads, follow-ups, sales CRM | Pending | Verify assigned-lead RLS and INR usage. |
| 0014 | `0014_employee_crm_access.sql` | Employee CRM routing/access | Pending | Verify only assigned records visible. |
| 0015 | `0015_crm_followup_numbers.sql` | Follow-up numbering | Pending | Verify positive number constraint/index. |
| 0016 | `0016_crm_currency_inr.sql` | CRM currency correction | Pending | Verify INR defaults. |
| 0017 | `0017_task_assignment_permissions.sql` | Task permissions/direct grants | Pending | Verify `tasks.assign` / `tasks.manage_access`. |
| 0018 | `0018_profile_photo_delete_policy.sql` | Avatar delete policy | Pending | Verify only owner can remove photo. |
| 0019 | `0019_task_assignment_delete_policy.sql` | Assignment delete policy | Pending | Superseded by later scoped reset. |
| 0020 | `0020_super_admin_permission_architecture.sql` | Super Admin role/permissions | Pending | Enum additions must be committed before use. |
| 0021 | `0021_super_admin_control_layer.sql` | Effective permission/direct grant layer | Pending | Verify expiry, revocation, active status. |
| 0022 | `0022_finance_accounts_mvp.sql` | Finance, invoices, payroll base | Pending | Backup finance data before corrective changes. |
| 0023 | `0023_finance_workflow_completion.sql` | Receipts, payment workflow, finance audit | Pending | Verify receipt bucket/policies and payment trigger. |
| 0024 | `0024_payroll_payment_metadata.sql` | Payroll payment metadata | Pending | Verify paid payroll ledger linkage. |
| 0025 | `0025_role_permission_qa_fix.sql` | Role-permission QA correction | Pending | Legacy schema is corrected by 0026. |
| 0026 | `0026_legacy_role_permission_schema_fix.sql` | Legacy role-permission compatibility | Pending | Verify `role_permissions(role, permission_id)` mappings. |
| 0027 | `0027_general_manager_scope_qa_fix.sql` | GM leave/task scope | Pending | Verify team-only queries. |
| 0028 | `0028_general_manager_task_policy_cleanup.sql` | Task visibility policy cleanup | Pending | Verify scoped task helper. |
| 0029 | `0029_general_manager_assignment_escalation_fix.sql` | Prevent GM assignment escalation | Pending | Verify `can_manage_task_assignment(uuid,uuid)`. |
| 0030 | `0030_task_assignment_policy_reset.sql` | Remove legacy permissive assignment policies | Pending | Query `pg_policies`; GM unrelated self-assignment must fail. |

Suggested verification query after `0030`:

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'task_assignments'
order by policyname;
```

Do not use a broad `drop ... cascade` as a rollback. Restore a known-good, tested policy only through a reviewed corrective migration.
