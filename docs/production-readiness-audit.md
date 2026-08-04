# BSmile CRM production-readiness audit

Status: in progress. This register records live evidence only; passing unit tests
or a successful build is not counted as production acceptance.

## Coverage started

- Environment: live BSmile CRM and Supabase project `ksmqzxncdvuxiabypjth`
- Roles authenticated or inspected: Super Admin (QA), Chairman (QA), Director
  (QA), General Manager, Administration, Psychologist, Intern, Guest Sales,
  Staff (QA)
- Live browser checks: General Manager, Guest Sales, Administration,
  Psychologist
- Authenticated RLS/storage checks: Intern and Guest Sales

## Issue register

| ID | Severity | Module | Role | Finding | Resolution | Retest |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | High | Roles & Access | Chairman, Director | `has_permission` returned `true` for `roles.manage`, `permissions.manage`, and `audit.view`, contrary to the security model. | Applied forward-only migration `0049_security_permissions_super_admin_only.sql`; it revokes protected role and direct grants from all non-super-admin management roles. | Passed: authenticated checks show all three permissions false for Chairman and Director; Super Admin remains true. |
| AUTH-002 | High | Employee workspace | Administration | The dashboard showed attendance, leave, and task actions, but `/employee/attendance` redirected to `/unauthorized` because self-service grants were missing. | Applied forward-only migration `0050_employee_self_service_permission_baseline.sql` with scoped self-service grants only. | Passed: Administration workspace checks completed with direct attendance route coverage. |
| AUTH-003 | Medium | Role matrix tooling | QA audit accounts | Existing QA passwords differ from the shared employee credential, so API audit tooling must use the controlled QA credential from local secure configuration. | Audit script reports failed authentication rather than assuming a role result. | Open: keep credentials out of source and use the secure test credential only. |
| PAT-004 | Critical | Intern patient workspace | Intern | Intern login selected `/employee/patients`, but the deployed route returned a 404 before any assigned-patient scope could be exercised. | Added the missing scoped list and detail routes, with a no-create list configuration and route-availability regression test. | Passed: fresh live Intern session loads the assigned-patients route and only the controlled assigned record. |
| FIN-005 | High | Income and expense master data | General Manager | Income loaded with no active finance accounts or categories, leaving the creation form disabled. Seeded master data remained invisible because existing RLS did not recognize granular income/expense grants. | Applied forward-only `0051` master-data seed and `0052` granular finance RLS migration. | Passed: live income and expense dropdowns show approved accounts/categories; controlled QA expense saved and was archived after verification. |

## Verified controls

- General Manager: role-aware dashboard label, profile route, and denial of
  `/admin/access`.
- Guest Sales: assigned CRM access, attendance and finance route denial, safe
  unavailable-lead response without raw database errors.
- Intern: assigned patient and document metadata/signed URL access only;
  unassigned patient/document, finance, and employee directory are blocked by
  authenticated RLS tests.
- Guest Sales: assigned lead/sale and sales-document access works; patients,
  finance, and employee directory are blocked by authenticated RLS tests.
- Psychologist: self-service workspace loads; direct finance route is denied.

## Remaining audit batches

1. Complete role-by-role browser and responsive navigation/route coverage.
2. Employees, attendance, leave, task, chat, and notification workflows.
3. CRM, patients/documents, finance, payroll, invoices, and reports workflows.
4. API, storage, and RLS operation matrix; final regression/build validation.
