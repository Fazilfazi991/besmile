# Phase 7 authenticated release gate

Prepared 2026-09-03. Production was inspected read-only and was not changed.

## Security-definer closure

All 176 production `public` SECURITY DEFINER bodies were reviewed from the live catalog and reconciled with their latest repository definitions, call sites, policy dependencies, triggers, identity sources, and execute grants.

| Classification | Count |
| --- | ---: |
| Safe | 93 |
| Safe but over-privileged | 41 |
| Hardened | 1 |
| Internal trigger — not directly callable | 41 |
| Legacy / unused — reviewed | 0 |
| Unresolved | 0 |

The 41 over-privileged functions are fully enumerated by `20260903211500_restrict_remaining_security_definer_execution.sql`: 31 read/authorization helpers become authenticated-only and ten trigger functions lose all API-role execution. Together with the two earlier candidate migrations, expected post-migration PUBLIC/anon execution for the reviewed privileged surface is zero. The externally callable authenticated RPCs retain their body-level authentication, permission/resource relationship, and workflow-state checks. Caller-supplied identity and record UUID parameters are checked against `auth.uid()`, permission helpers, ownership, assignment, management tree, or membership as appropriate. `role_has_permission` uses fixed SQL templates and bound values rather than caller-composed SQL.

## RLS and storage

The live inventory is 115 public tables and 211 policies. Predicate-level review result: 211 reviewed, 211 safe statically, zero hardening-required, zero unresolved. The risk query checked every INSERT/UPDATE/DELETE/ALL policy for `true`, missing UPDATE checks, or `anon`/`public` write roles. Its only match was `service role manages profiles`, explicitly restricted to `service_role`. Sensitive predicates are based on authenticated profile/employee identity, permission checks, management/clinician/resource relationships, conversation membership, ownership, and workflow state. Authenticated behavior still requires the controlled tests below.

All nine buckets are private:

| Bucket | Predicate boundary | Static result / tamper test |
| --- | --- | --- |
| chat-attachments | conversation membership plus chat permission and controlled conversation path | Safe; non-member C attempts A+B path: deny |
| employee-documents | owner/subject UUID, document relationship, management permission, constrained folder and MIME/size | Safe; A attempts B path: deny |
| finance-receipts | finance permission and receipt-record relationship | Safe; employee attempts finance path: deny |
| idea-attachments | visible idea/owner relationship and controlled idea path | Safe; unrelated idea path: deny |
| leave-attachments | request owner or leave reviewer and request relationship | Safe; A attempts B request path: deny |
| patient-documents | `patient_document_access` joined by exact storage key | Safe; unrelated patient path: deny |
| policy-documents | `policy_document_visible`; manager writes require permission and owner | Safe; unauthorized document path: deny |
| profile-photos | authenticated owner UUID in both owner and first folder segment; management read | Safe; A attempts B upload/delete: deny |
| sales-documents | exact sales document relationship plus sale view/edit and document permissions | Safe; unrelated sale path: deny |

Client-controlled paths do not independently grant access; they are paired with authenticated identity, a database record relationship, membership, or a permission helper.

## Controlled identities and direct RPC matrix

| Identity | Actual role | Required permissions / use |
| --- | --- | --- |
| Director | `director` | highest-privilege denial baseline, reporting, permissions |
| General Manager | `general_manager` | management tree, staff, leave, appointments, CRM, reports |
| Administration Admin | `administration_admin` | employee lifecycle and document administration |
| Finance user | existing role with finance/payroll grants | finance, payroll, receipts, psychologist payables |
| Psychologist | `psychologist` | assigned patients, appointments, clinical documents |
| Ordinary employee | ordinary active staff role | low-privilege denial baseline, attendance, leave, tasks, chat |
| Chat peer B/C | ordinary active staff roles | member/non-member isolation and Realtime |

Run `node scripts/qa-authenticated-release.mjs` with `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, and the matching `QA_<ROLE>_EMAIL` / `QA_<ROLE>_PASSWORD` variables. Credentials are never printed or persisted. Read-only is the default. `QA_ALLOW_WRITES=true` aborts against production ref `ksmqzxncdvuxiabypjth`.

Direct cases: ordinary employee calls staff-management, leave-approval, appointment-management, finance, payroll, permission-management, and reporting RPCs (deny); corresponding permission holder performs a marked staging operation (success). Chat member/non-member, document owner/non-owner, and scoped clinician/unassigned clinician pairs must each prove success and denial.

## Workflow, failure, duplicate, and performance matrix

All write fixtures use `BSMILE_QA_<timestamp>` and a recorded cleanup list on staging only. Cover CRM lead/client conversion, appointments, tasks, attendance, leave, meetings, calendar, chat, documents, finance, and payroll. Finance fixtures use synthetic accounts and amounts only; lower privilege must be unable to list another salary, mutate payroll, create finance entries, alter payments, or view psychologist payments.

For lead, client, appointment, task, leave, meeting, chat message, document upload, and finance entry, submit twice and record the intended protection layer: disabled UI/loading state, idempotency key where supported, RPC transaction, or database unique constraint. A second business action is not assumed invalid where duplicates are legitimate.

Inject timeout/offline/401/403/409/storage/RPC/validation failures. Each must end loading, re-enable controls, avoid duplicates, show a useful message, and omit SQL/stack internals.

Chrome benchmark procedure: use one controlled management identity, production-equivalent data, cache-cold once then three warm navigations. Capture navigation duration, total requests, Supabase requests, transferred bytes, slowest request, RSC requests, and auth/profile requests for Dashboard, Employees, Clients, Tasks, Attendance, Leave, Chat, CRM, Finance, Finance Reports, Admin Reports, Calendar, and Notifications. Compare medians with Tokyo references: 1221, 1313, 1192, 1313, 1375, 1464, 1438, 1424, 1582, 1166, 1401, 1263, and 1264 ms respectively. Record browser/version, network profile, region, SHA, and timestamp.

## Migration package

For each candidate migration, precheck with `has_function_privilege` for the exact arrays in the file; apply through the normal reviewed Supabase migration workflow; postcheck exact roles; then smoke the affected module. Do not edit historical migrations.

- `20260903184848_restrict_internal_appointment_audit_rpc.sql`: remove anonymous/internal audit execution; smoke appointment audit creation through its parent workflow.
- `20260903192350_restrict_broad_privileged_function_execution.sql`: ten business RPCs authenticated-only and 17 triggers internal-only; smoke appointments, chat/group membership, task expiry, notifications, finance and audit triggers.
- `20260903211500_restrict_remaining_security_definer_execution.sql`: 31 policy/read helpers authenticated-only and ten triggers internal-only; smoke login, RLS-protected list/detail screens, attendance, employee/task enforcement, finance payment, and notifications.

Rollback is a new corrective migration, never a history rewrite: grant authenticated to a required callable signature; grant anon only if a documented unauthenticated workflow proves it necessary; never grant trigger functions to API roles. Re-run the same postcheck and smoke suite after correction.

## Production Auth remediation

An authorized Auth administrator must process these five identities: `aiswaryabsmile@gmail.com`, `ayishamuneer.dxb@gmail.com`, `bsmile.gm@gmail.com`, `diyaadminbsmile@gmail.com`, and `fazil4fazi@gmail.com`.

For each: verify the person and account; generate a unique credential through the approved manager; rotate the password; revoke all sessions/refresh tokens; confirm the previous credential fails; deliver the replacement through the approved secure channel; have the user verify access; record completion and time without recording any password. Then run this document's qualification immediately.

## Preserved-checkout decisions

- `.env.example`: deferred; no unused variables imported.
- `admin/employees/page.tsx`: superseded by candidate filtering and Director-exclusion coverage.
- `browser-push-settings.tsx`: deferred; unrelated and no reproduced release blocker.
- `idea-hub.tsx`: deferred pending authenticated duplicate reproduction.
- `permission-access.ts`: superseded/deferred; route/backend permissions remain authoritative and no candidate regression was established.

Do not import the calendar UX change, layout experiment, module icon redesign, or standalone production cleanup test.

## Lint classification

The 35 starting warnings were reviewed: one confirmed functional accessibility warning (a listbox option missing `aria-selected`) and 34 low-risk technical-debt warnings (21 deliberately mount/reload-scoped hook dependency notices, six internal-navigation notices, six image-optimization notices, and one config style notice). The accessibility warning is fixed in this candidate; expected remaining state is zero functional-risk and 34 low-risk warnings.

## Final execution order

Close the credential incident, run role/RPC denial tests, finance/payroll, chat, documents/storage, write workflows, duplicate and recovery cases, the Chrome benchmark, then the final test/typecheck/lint/build gate. Production migrations remain unapplied until every authenticated gate passes and the release SHA is finalized.
