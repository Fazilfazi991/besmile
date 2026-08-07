# BSMILE CRM — Full system audit

Audit date: 2026-08-07. Scope: source, migrations, permission/navigation code, existing QA evidence, and automated validation. The supplied requirement brief was used as the requirement baseline.

## 1. Executive summary

Estimated implementation coverage: **61%**. The CRM has a substantial, test-covered foundation: scoped CRM, patients, employee workspace, attendance, leave, tasks, internal chat, documents, announcements, notifications, doctor scheduling, Idea Hub, feedback retrieval, and a multi-page finance module. The two mandatory client features that are wholly absent are **email OTP 2FA** and a genuine **chatbot**.

Priority count: **P0 2**, **P1 12**, **P2 10**. This is an implementation audit, not production acceptance: no supplied live URL, credentials, or isolated test database permitted end-to-end role/RLS or destructive workflow verification.

## 2. Requirement coverage

| Module | Status | Completion | Evidence / gap |
| --- | --- | ---: | --- |
| Leads | PARTIAL | 70% | Create, assignment, name/phone search, follow-ups, import and scoped access exist. Email field, communication history, scheduled follow-up reminders, and Lead → Patient/Client conversion are absent. |
| Clients / Patients | PARTIAL | 65% | Patient profiles, assigned clinician, sessions, documents, notes, activity and appointments exist. Appointment history categories, feedback linkage, client follow-up automation, and terminology consistency are incomplete. |
| Employees / Members | PARTIAL | 65% | Add/edit, department, designation, manager, status, documents and grants exist. Required `intern`, `probation`, and `resigned` statuses, performance/responsibilities, and full disable/reactivate audit were not found. |
| Attendance | PARTIAL | 75% | Clock-in/out, breaks, duplicate guard, timezone rules and history exist. GM/management live workflow remains unverified. |
| Leave | PARTIAL | 75% | Request, overlap/balance helpers, approval events, statuses and notifications exist. Live authorization/deep-link verification is outstanding. |
| Tasks | PARTIAL | 75% | Assignments, lifecycle, comments/attachments, due-state and notifications exist. GM live boundary verification is outstanding. |
| Calendar / availability | PARTIAL | 60% | Day/week/month schedules, availability, blocked periods, slot generation, status colours, rescheduling/cancellation and database conflict prevention exist. Psychologist self-availability, reminders, recipient notifications and dedicated appointment notes are incomplete. |
| Outsourced doctors | PARTIAL | 75% | Doctor list, profile, weekly availability, blocked dates, appointment relationships and scoped permissions exist. Intended-role live verification remains. |
| Innovation Hub | PARTIAL | 75% | Ideas, categories, attachments, comments, supports/likes and permissions exist. Multi-role live visibility and notification delivery remain unverified. |
| Feedback | PARTIAL | 45% | Google Sheet retrieval and CRM list/search/rating UI exist. Automated client/psychologist association, export, recurring-concern analysis and mapping validation are absent or client-data dependent. |
| Documents | PARTIAL | 60% | Employee requests/submissions, operational documents, patient documents, signed URLs, types, expiry field and storage policies exist. Appointment/certification/agreement taxonomy, expiry reminders and malware scanning are missing. |
| Notifications | PARTIAL | 60% | Read/unread, preferences, sound, browser push, task/leave/document/announcement/lead triggers exist. Follow-up, expiry and appointment-recipient reminders need scheduled/event work. Appointment deep-link workflow was fixed in this audit. |
| Announcements | PARTIAL | 75% | Published/audience/recipient/read records and management routes exist. Direct-URL/RLS live verification remains. |
| Internal chat | PARTIAL | 70% | Conversations, members, unread state, messages and controlled attachments exist. Mobile/scroll/empty-conversation live QA remains. |
| Chatbot | MISSING | 0% | No chatbot route, component, service, knowledge base, or handoff workflow was found. |
| 2FA / security | PARTIAL | 40% | Supabase Auth, middleware, RBAC/RLS and storage controls exist. Login is password-only; there is no email OTP second factor, session timeout, or login activity tracking. |
| Roles / permissions | PARTIAL | 70% | Sidebar filtering, middleware and RLS-oriented migrations exist; prior QA evidence covers several restricted roles. Full role × API × RLS live matrix remains required. |
| Dashboards | PARTIAL | 60% | Management, employee and finance dashboards exist. KPI correctness, every link and responsive values were not live-verified. |
| Reports | PARTIAL | 35% | Finance report supports CSV and print. No evidence of Excel/PDF download or required non-finance reporting suites. |
| Finance | PARTIAL | 75% | Dashboard, income, expenses, invoices, payment registration, payroll and finance reports exist with validation and granular permissions. Live lifecycle/ledger/RLS testing is still required. |

## 3. Missing client requirements / add-ons

- Email + password + **email OTP** two-factor login.
- Chatbot for FAQs, processes, service information, appointment enquiry and staff handoff. Client-approved knowledge/content is required.
- Psychologist self-service availability rather than only outsourced-doctor administration.
- Appointment/follow-up/document-expiry reminder scheduler and recipient-specific appointment notifications.
- Lead-to-client/patient conversion that preserves source data and history.
- Client feedback association/mapping, exports, and recurring-concern analysis. Google Form/Sheet must provide stable client and psychologist identifiers; otherwise this is a client data/mapping requirement.
- Full reporting suite (leads, patients, employees, attendance, leave, appointments, feedback and documents), including required Excel and PDF exports.
- Document categories/workflows for appointments, certifications, agreements and administrative records, plus expiry reminders.
- Required employee statuses: Intern, Probation and Resigned.
- Login activity and an explicit session-timeout policy.

## 4. Hidden / unlinked inventory

The current sidebar intentionally permission-filters pages. Implemented routes include: employee assigned patients, task access/manage, patient detail/document APIs, innovation category management, doctor scheduling, finance income/expense/invoice/payroll/report pages, customer feedback, push APIs, and profile/notification workspaces. No code-backed major module was found completely absent from the navigation for a role that has its corresponding permission. Navigation visibility must still be verified with actual configured role grants.

## 5. Finance audit

| Area | Status | Notes |
| --- | --- | --- |
| Dashboard | PARTIAL | Computes income, expenses, net, balances, outstanding invoices and payroll summary. Date filters and live data accuracy require QA. |
| Income / expenses | PASS (code) | Create/edit/archive, categories, account, amount/date/reference/notes and receipt validation are present. Live RLS and ledger persistence remain unverified. |
| Invoices / payments | PARTIAL | Draft/sent/cancelled, line items, tax/discount, printing, partial/multiple payments and overpayment helper exist. Issued/overdue automation and PDF output need confirmation. |
| Payroll | PARTIAL | Salary settings, run, approval, paid ledger link and duplicate guard exist. Inactive/resigned eligibility and end-to-end role validation remain. |
| Reports | PARTIAL | Finance report and CSV/print exist; Excel/PDF and broader report coverage are missing. |
| Permissions | PARTIAL | Route guards and migrations define granular finance grants; actual Chairman/Director/GM/finance-user RLS validation is outstanding. |

## 6. Role access matrix (code-level)

| Role | Intended workspace / tested source controls | Remaining evidence needed |
| --- | --- | --- |
| Super Admin / Chairman | Admin shell; access control separated for Super Admin in middleware. | Authenticate and confirm every write/RLS action. |
| Director | Management admin shell with granular finance/CRM permissions. | Confirm finance and employee scope live. |
| General Manager | Management shell and scoped employee/task/leave controls. | Attendance self-service and every management write action. |
| Psychologist / Intern | Employee shell; assigned patient, document and scheduling permissions are grant-driven. | RLS access to assigned vs unassigned data. |
| Administration | Employee shell plus explicitly granted operational modules. | Direct URL and server-action checks. |
| Leads team / Rishad | Scoped CRM grants are supported. | Confirm no HR/admin/finance grant or RLS leak. |
| Regular staff | Own/assigned workspace expected; admin routes blocked by middleware. | Full API/RLS denial test. |

## 7. Broken workflows found and fixed

| Severity | Reproduction | Expected / actual | Fix |
| --- | --- | --- | --- |
| High | Open an appointment notification created by the scheduling SQL. | It stored an `/admin/doctor-scheduling?appointment=…` link; employee notification safety redirected it back to Notifications, admin notifications had no link, and the scheduling page ignored `appointment`. | Employee links are translated to employee scheduling; both route pages pass `appointment`; the scheduler focuses/opens that appointment after load; admin notifications now expose the related link. |

## 8. Security, data integrity, and UI findings

- Positive controls: migrations enable RLS for major domain tables; patient/appointment/document foreign keys, indexes, status checks, archive fields and scoped storage are present. Invoice payment and payroll helpers provide duplicate/overpayment protection.
- Security P0: the required OTP factor, session timeout and login activity are absent. Password-only login is implemented in `src/app/sign-in/page.tsx`.
- Security P1: live RLS/API tests are mandatory before release; static review cannot prove deployed policies and function grants are current. Run Supabase advisors against the deployed project.
- Data P1: client feedback cannot be safely auto-linked without required form/sheet identifiers; classify this as client mapping work, not a silent failure.
- UI P1: browser responsive QA was blocked because the in-app browser cannot reach this host-local server, and no deployed URL/test session was supplied. Source CSS provides mobile schedules/tables, but this is not a visual acceptance result.
- Build P2: 25 lint warnings remain (mostly effect dependencies and unoptimized image tags); they do not fail this build but should be addressed to reduce stale-data risk.

## 9. Client information required

- Approved chatbot content, escalation/handoff rules, and appointment enquiry policy.
- Google Feedback Form/Sheet fields that uniquely identify client and psychologist; permissions for the service account.
- Scheduling ownership rules for employed psychologists versus outsourced doctors, reminder lead times and cancellation/reschedule policy.
- Finance business rules: invoice overdue timing, tax/discount semantics, payroll eligibility and approval authority.
- Final role-to-module/write/approve matrix.

## 10. Verification and release status

- `npm run typecheck`: pass.
- `npm run lint`: pass with 24 warnings before this fix; build reports 25 warnings after the new component’s existing effect is included.
- `npx vitest run`: 68 files / 227 tests pass before the fix; targeted appointment-notification regression test passes after it.
- `npm run build`: pass after the fix; 64 routes generated.
- Browser QA / role QA / responsive QA: not testable in this audit environment; requires accessible deployment plus controlled role accounts.
- No deployment was performed. The worktree contained unrelated uncommitted feedback migration/test files, which were preserved and excluded from this audit fix.

## 11. Remaining backlog

**P0 — before client review:** email OTP 2FA; chatbot scope/content/handoff; full live role/RLS/security test; real responsive browser QA.

**P1:** client/lead conversion, scheduler reminders, psychologist availability, feedback mapping/linking, document-expiry automation, report/export suite, finance lifecycle verification.

**P2:** employee status/performance expansion, lint-warning cleanup, attachment malware scanning, report UX enhancements.

**Client decision required:** chatbot knowledge base; feedback identifiers; reminder timing; scheduling/clinical workflow ownership; finance rules; final permissions matrix.
