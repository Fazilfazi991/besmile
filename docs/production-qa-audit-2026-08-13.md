# BSmile CRM production QA audit — 2026-08-13

## Verdict

**NOT READY**

The critical Administration/Admin employee-directory exposure was fixed and retested in production. The release is still not ready because the repository test gate has three failures, production staff selectors contain duplicate/inactive/QA/vendor-like profiles, several high-risk action families were not safe to complete end-to-end, and the requested cross-device/export coverage is incomplete.

## Scope and environment

- Production: `https://besmile-three.vercel.app/`
- Production app version observed before the database fix: commit `1610c692843c9f17627bf2bee1835e013642c665`, deployment `dpl_6pQvoqPiiBRSQVwBFqHKGWZ1y7NF`
- Browser: Chrome desktop, authenticated production sessions
- Supabase project reference: `ksmqzxncdvuxiabypjth`
- Accounts exercised: General Manager, Administration/Admin, Psychologist, Intern, Guest Sales
- Test records use the `CODEX QA -` prefix. No real employee, patient, payroll, invoice, attendance, or finance record was deleted.

## Executive findings

| ID | Severity | Status | Finding |
| --- | --- | --- | --- |
| BSM-QA-001 | Critical | Fixed and retested live | Administration/Admin could browse all 27 employee profiles and open employee creation. The designation bundle incorrectly granted employee-management permissions. A production database boundary now limits these permissions to super admin, chairman, director, and general manager. Diya now receives `/unauthorized` for both employee list and create routes while retaining CRM access. |
| BSM-QA-002 | High | Open | Production employee/assignee pickers contain duplicate staff identities, inactive and QA accounts, and a vendor-like `Fusion Venture Works` profile. This affects dashboard counts, tasks, meetings, and any workflow using the shared profile directory. Ambiguous production records were not deleted. |
| BSM-QA-003 | High | Open | Full unit gate fails: 348/351 tests pass. Failures are in document-request upload rollback, final payroll-entry run completion, and atomic lead-to-patient conversion assertions. These failures overlap pre-existing uncommitted work and were not overwritten. |
| BSM-QA-004 | Medium | Open | Production admin navigations commonly took about 2.8–4.3 seconds; several routes still showed skeleton content after one second. Chat and CRM dashboard were among the slowest observations. Local production build took 185.3 seconds. |
| BSM-QA-005 | Medium | Open | The task edit overlay has no dialog semantics and its title, description, priority, and due-date fields have no accessible labels. |
| BSM-QA-006 | Low | Open | Dashboard attendance KPI and “View employees” attendance action route to `/admin/employees` instead of the staff attendance workspace. |
| BSM-QA-007 | Medium | Open | Build succeeds but reports numerous stale `useEffect` dependency warnings, including CRM, employees, finance, attendance, meetings, tasks, chat, scheduling, reports, and patient workspaces. These can cause stale data or duplicated effects. |

## Permission boundary evidence

Authenticated `has_permission` and RLS checks after the production fix:

| Account | Visible profiles | Employee view/create/edit/status | Expected retained access |
| --- | ---: | --- | --- |
| General Manager | 27 | Allowed | Management access retained |
| Administration/Admin (Diya) | 1 | Denied | `admin.shell`, CRM management, leads, and sales retained |
| Psychologist | 1 | Denied | Own/clinical scope only |
| Intern | 1 | Denied | Own assigned scope only |
| Guest Sales | 1 | Denied | Own CRM/sales scope only |

The production SQL was applied manually in Supabase SQL Editor because the connected Supabase control-plane API returned `You do not have permission to perform this action`. The migration is recorded locally as `20260813070122_restrict_administration_admin_employee_management.sql`; control-plane migration-history verification and automated security/performance advisor retrieval remain blocked by that connector permission.

## Action lifecycle evidence

### Tasks

`CODEX QA - TASK - 20260813T1107` was created in the Chrome UI, assigned to Diya, edited to `CODEX QA - TASK - 20260813T1107 UPDATED`, changed to high priority, completed, reloaded, and verified persisted. Final record ID: `e478cefa-5406-4603-ae8b-ef95e6551da5`. There is no delete/archive action, so the safe final state is completed.

### Meetings

The Chrome meeting form and validation were exercised. A deterministic authenticated production RPC lifecycle then created `CODEX QA - MEETING - 20260813T1125`, rejected a same-organizer/same-time collision, edited the record, cancelled it, and read it back as cancelled. Final record ID: `b88e950e-4493-45ba-99d6-c3c457841646`.

### Authentication

- Valid General Manager and Administration/Admin sign-in: pass.
- Invalid password: pass; `Invalid login credentials` shown without an application console error.
- Malformed email: pass; native email validation shown.
- Sign-out: pass; returned to `/sign-in`.
- Empty-field testing was partially affected by Chrome password-manager autofill. Required attributes exist in source, but this item is not counted as a complete live pass.

## Route and module matrix

Status meanings: **PASS** = live route/access behavior verified; **PARTIAL** = route/read/filter or a subset of actions verified; **BLOCKED** = unsafe or unavailable prerequisite; **NOT RUN** = no defensible live evidence in this run.

| Area | Route(s) | Status | Evidence / limitation |
| --- | --- | --- | --- |
| Executive dashboard | `/admin` | PARTIAL | KPIs, team strip, shortcuts, finance and operational cards rendered. Duplicate/stale profile data and slow load observed. No destructive quick action used. |
| Operational reports | `/admin/reports` | PARTIAL | Report UI and CSV/Excel/Print controls rendered. Download file integrity was not completed. |
| Employees | `/admin/employees`, `/admin/employees/new` | PASS for boundary/read | GM directory rendered 27 profiles. Search/read/navigation exercised. Diya list/create direct URLs now deny. Creation/deactivation/removal was not attempted on real production identities. |
| Patients | `/admin/patients` | PARTIAL | List route rendered. No synthetic patient was created because safe cleanup and clinical data prerequisites were not established. |
| Documents | `/admin/documents` | PARTIAL | Workspace rendered. Upload/request/review lifecycle not completed; full suite also reports a rollback regression assertion. |
| My attendance | `/admin/my-attendance` | PARTIAL | Route rendered. Real geolocation/clock lifecycle was not mutated. |
| Staff attendance | `/admin/attendance` | PARTIAL | Route and management view rendered. No real employee attendance was edited. |
| Calendar | `/admin/calendar` | PARTIAL | Route rendered; meeting lifecycle supplies calendar persistence evidence. Personal block lifecycle not completed. |
| Meetings | `/admin/meetings` | PASS | UI form inspected; create/edit/conflict rejection/cancel/persistence completed with a QA-only record. |
| Leave | `/admin/leaves` | PARTIAL | Approval workspace rendered. A real leave request was not approved/rejected. |
| Tasks | `/admin/tasks` | PASS | Create/edit/reassign/status/reload persistence completed. Search exercised. Final QA task completed. |
| Appointment scheduling | `/admin/doctor-scheduling` | PARTIAL | Route rendered. Zero available psychologist capacity was shown; no live appointment mutation was made. Conflict rules have repository tests, but live add/edit/cancel coverage is incomplete. |
| Innovation Hub | `/admin/ideas` | PARTIAL | Workspace rendered. Submission/comment/status/report actions not completed in this run. |
| Customer feedback | `/admin/customer-feedback` | PARTIAL | Workspace rendered. Submission lifecycle not completed. |
| Chat | `/admin/chat` | PARTIAL | Workspace rendered; existing text/emoji/voice feature data was visible. New voice capture was blocked by lack of a controlled microphone fixture. |
| Announcements | `/admin/announcements` | PARTIAL | Workspace rendered. Create/edit/archive action was not completed. |
| Notifications | `/admin/notifications` | PARTIAL | Notification workspace rendered. Read/unread and cross-user delivery were not fully exercised. |
| Profile | `/admin/profile` | PASS for read | Profile route rendered. No real profile identity fields were changed. |
| CRM dashboard | `/admin/crm` | PASS for access | Rendered for GM and remained available to Diya after the permission fix. |
| Leads | `/admin/crm/leads` | PARTIAL | Lead list and live CRM access exercised. New lead/follow-up/convert/archive lifecycle not completed in this run. |
| CRM follow-ups | `/admin/crm/follow-ups` | PARTIAL | Route rendered; no real follow-up mutation. |
| CRM sales | `/admin/crm/sales` | PARTIAL | Route rendered; no real sale mutation. |
| CRM import | `/admin/crm/import` | PASS for denial | GM direct route returned unauthorized, consistent with absence of `crm.import`. |
| Finance dashboard | `/admin/finance` | PARTIAL | Route and KPIs rendered. No financial mutation. |
| Income / expenses | `/admin/finance/income`, `/admin/finance/expenses` | PARTIAL | Both routes rendered. No production transaction created. |
| Invoices | `/admin/finance/invoices`, `/admin/finance/invoices/new` | PARTIAL | List and creation form rendered. Draft/send/pay/cancel lifecycle not completed. |
| Payroll | `/admin/finance/payroll`, `/admin/finance/payroll/settings` | PARTIAL | Routes rendered. No production payroll state changed; full suite has a final-entry completion regression assertion. |
| Finance reports | `/admin/finance/reports` | PARTIAL | Route rendered. Export integrity not completed. |
| Employee/staff surfaces | employee, clinician routes | PARTIAL | Role/RLS profile counts and permission RPCs were checked for psychologist, intern, and guest sales. Full per-route action retest was not completed. |
| Responsive/mobile | major workflows | NOT RUN | Desktop Chrome was exercised. Requested laptop/tablet/mobile viewport sweep is incomplete. |

## Validation gate

| Check | Result |
| --- | --- |
| Permission-focused tests | PASS — 22/22 |
| TypeScript | PASS — `tsc --noEmit` |
| Full unit suite | FAIL — 348 passed, 3 failed, 351 total |
| Production build | PASS — Next.js 15.5.20, 74 static pages generated, 185.3 s total |
| Build lint | PASS with warnings — missing hook dependencies and unoptimized images |
| Standalone lint | INCONCLUSIVE — exceeded the 64 s command window; build lint completed |
| Supabase security/performance advisors | BLOCKED — connector permission denied |

## Test data left behind

| Record | Final state | Reason retained |
| --- | --- | --- |
| `CODEX QA - TASK - 20260813T1107 UPDATED` | Completed | Tasks have no safe delete/archive control. |
| `CODEX QA - MEETING - 20260813T1125 UPDATED` | Cancelled | Cancellation is the supported non-destructive terminal state. |

## Required next release gate

1. Resolve the three failing tests and rerun the complete suite.
2. Reconcile duplicate/stale/QA/vendor profiles with a named data owner; do not bulk-delete without identity mapping.
3. Complete safe action tests for documents, leave, scheduling, CRM conversion, invoices/payroll, announcements, notifications, exports, and employee/clinician role surfaces.
4. Run desktop/laptop/tablet/mobile viewport coverage and verify downloaded file contents.
5. Grant the audit connector enough read access to retrieve Supabase security/performance advisors and verify production migration history.
6. Fix high-impact hook dependency warnings and remeasure slow routes.
