# BSmile role QA matrix

Run `npm run seed:qa-users` only against a non-production Supabase project. Apply migrations through `0030_task_assignment_policy_reset.sql` first. The seed only writes `@qa.bsmile.local` users. Set `QA_SEED_PASSWORD` in the shell; never commit passwords or secrets.

| Account | Role / status | Landing route | Expected access |
| --- | --- | --- | --- |
| `super-admin@qa.bsmile.local` | Super Admin, active | `/admin` | Every admin route through the permission override. |
| `chairman@qa.bsmile.local` | Chairman, active | `/admin` | Management, Finance, Invoices, Payroll, Reports, CRM and Access. |
| `director@qa.bsmile.local` | Director, active | `/admin` | Same management finance correction; no Super Admin override. |
| `general-manager@qa.bsmile.local` | General Manager, active | `/employee/dashboard` | Team scope only; no Roles & Access or finance/payroll management. |
| `staff@qa.bsmile.local` | Staff, active | `/employee/dashboard` | Own records and assigned work only; `/admin/*` denied. |
| `finance-viewer@qa.bsmile.local` | Staff, active | `/employee/dashboard` | Temporary `finance.view`; Finance reads only, no mutation or Payroll settings. |
| `inactive@qa.bsmile.local` | Staff, inactive | `/sign-in?inactive=1` | Protected routes and data denied. |

## Test sequence

1. Use a separate private/incognito session per role.
2. Test `/admin`, `/admin/access`, `/admin/tasks`, `/admin/crm`, `/admin/crm/import`, `/admin/finance`, `/admin/finance/invoices/new`, `/admin/finance/payroll/settings`, and `/admin/finance/reports`.
3. Revoke the Finance Viewer grant, refresh, and confirm navigation/route access disappear. Repeat with future and expired start dates.
4. As Staff, query another employee's attendance, leave, task assignment, and lead: return no records or RLS denial. Finance and Payroll tables must be denied.
5. Label finance test records `QA-`, archive them after verification, and never delete real financial data.

## Route matrix

| Route family | Required permission |
| --- | --- |
| `/admin` | `admin.access` |
| `/admin/access` | `roles.manage` |
| Tasks / task access | `tasks.assign` / `tasks.manage_access` |
| CRM / import | `crm.manage_all` / `crm.import` |
| Finance reads / writes | `finance.view` / `finance.manage` |
| Invoice reads / new or writes | `invoices.view` / `invoices.manage` |
| Payroll reads / settings or writes | `payroll.view` / `payroll.manage` |
| Reports | `reports.view` |
