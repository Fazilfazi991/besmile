# Urgent operations batch — 20 October 2026

## A. Preflight

- Fresh `git fetch origin` completed before repository work.
- Baseline: `origin/production-readiness` = `4c3948c2a50c3bda5e0898ebd71fe430354a447d`.
- Vercel's READY Production deployment `dpl_BrRh4XCXpSFQ2FwN5CHqQfaFJtch` reports that exact SHA and branch; alias `besmile-three.vercel.app`.
- New isolated worktree: `worktrees/urgent-operations-oct20`; branch `codex/urgent-operations-oct20`. Existing checkout was clean. No other branch/worktree was modified.
- Production public JavaScript identifies Supabase project `ksmqzxncdvuxiabypjth`. Local `.env.local` and release-gate credentials point to QA project `enylrvmjgbntkrgpqsfe`; these were not treated as Production verification.
- Connected Supabase lists a different inactive project and explicitly denies a read-only query against Production. Browser account also lacked project access. The user is connecting the Production account. Current Production identities, policies and holiday rows are therefore **not yet reverified**.

## B. Varna / Daily Work

Release 2 replaced owner write policies and `can_review_daily_work()` with active-only checks. The new forward migration admits active, intern and probation internal employees, while requiring login enabled, workforce visibility, no removal and no pending onboarding. It retains owner-only INSERT/UPDATE, both UPDATE predicates, and the existing profile/date uniqueness constraint.

Owner, attendance-management, management-tree and same-department review branches remain distinct. Department review does not become company-wide. No attendance, employee-management, finance or administrator permission is added. No Varna profile data is written by this batch.

Expected identity, pending current Production verification: `28739db2-cf25-4a4a-a817-dbef90153853`, `bsmilespecialed@gmail.com`, Varna Prakash, Special Educator, A009, probation psychologist.

Executable PostgreSQL tests cover eligible owner create/update, duplicate date denial, inactive/terminated/resigned/external/login-disabled/onboarding/hidden/removed denials, other-owner update denial, department scope and management-tree scope. The actual Daily Work component saved and updated using isolated probation fixtures at 390px without document overflow. This is local evidence, not a real Varna sign-in or Production write.

## C. Sales Coordinator booking

Expected identities, pending current Production verification:

| Account | Profile UUID | Login |
|---|---|---|
| Fatima Suhara | `04f7ade2-99ee-43d1-b4c0-de2cd168fc39` | `salesheadbsmile@gmail.com` |
| Fatima KR | `28516281-ec1c-4902-a786-346e1a51f001` | `marketingcobsmile@gmail.com` |

The existing route and navigation require `doctor_scheduling.view`; booking controls and `appointment_has_permission('create')` accept `doctor_scheduling.create_appointments`. The existing identity-only client-options RPC allows active converted clients without clinical-workspace access. **No additional `appointments.view` or `appointments.create` grant is necessary.**

`supabase/release/urgent_operations_booking_grants.sql` is a release-only candidate, outside automatic migrations. It verifies both exact UUIDs, profile/Auth emails, names, Sales Coordinator designation, employee state, login, removal, onboarding, Auth confirmation and ban state before inserting only missing active grants for those two permission codes. It is retry-safe. It has not been run on Production.

Employee converted-lead detail now offers a permission-gated **Book appointment** CTA with the client ID preselected. Conversion itself remains independent of psychologist selection.

Using only the two scheduling permissions, the actual scheduling component at 390px exposed client selection, eligible staff/online psychologist selection, slot, fee, consultation type and remarks. Both staff and online fixture bookings returned **Appointment scheduled**. Unavailable psychologists were absent from the booking selector. Existing archive filters and clinician IDs are unchanged.

No new clinician-management, availability-edit, update, reschedule, cancel, delete, status-management, clinical-note, patient-clinical-record or payout permission is proposed. PostgreSQL tests execute the real permission helper with the grant candidate, check idempotency and identity drift, and deny all other appointment actions and an ordinary Sales fixture.

## D. Daily Marketing spend

- Reuses `finance_transactions`: one actual `expense` with the existing active Marketing category, selected valid subtype and active INR finance account. Payment method is selected from the existing valid choices rather than invented.
- New explicit entry permission: `crm.marketing_spend.manage`. Options and save RPCs check authenticated operational internal employee eligibility, including removal/onboarding/login checks. No broad Finance SELECT/INSERT/UPDATE or management grant is added.
- Amount starts blank and is manually editable. Any positive amount fitting the existing `numeric(14,2)` ledger is accepted. There is **no fixed daily budget/default spend**. Example amounts exist only in tests.
- Business date defaults to today in Asia/Kolkata. Past dates are supported; future dates are rejected in UI and SQL.
- Identity: date + subtype + account, only for rows marked `crm_daily_marketing`. This is a daily total for that combination, not an extra copy of the same financial event. Unrelated Marketing transactions remain distinct and are included in aggregate reporting.
- Existing marked totals load for correction. Saves use an advisory transaction lock, a unique partial index, exact retry comparison and an expected update timestamp. Concurrent/stale edits fail with a reload message. Identical retries return the same transaction ID without another write. Archived totals require Finance review and cannot be silently duplicated.
- Existing `finance_transactions_audit` records actor and complete before/after rows. Release refuses to enable the workflow without the existing audit trigger. Tests assert one creation audit and one correction audit, with no extra audit on duplicate retries.
- Entry appears in management CRM and employee CRM for explicitly authorized operators. The daily management report reuses existing CRM period filters and actual daily lead counts. Today/week/month/custom reporting computes total spend, total leads and blended CPL = total spend / total leads. Zero leads renders a dash. Existing Marketing Expenses cards remain and use the same ledger query; results are paged to avoid truncating long periods.
- Unit examples verify ₹400 / 10 = ₹40, weekly/monthly totals, correct blended CPL, multiple genuine expenses and zero leads. PostgreSQL additionally verifies arbitrary decimal amounts, missed-date correction, invalid data/unauthorized denial, no broad finance access, preserved unrelated transactions and safe retries. At 390px the blank form accepted ₹653.27 and corrected it to ₹278.91; both returned success.
- **Operator grants remain pending.** Muhammad Faiz AU and Internal Admin Diya have not been mapped from current Production to exact stable UUIDs. No guessed management grant exists in this branch.

## E. Dussehra

Forward migration changes the single 2026 canonical Holiday Calendar row from 24 October to **20 October 2026**, preserving its ID, title/year, holiday type and non-working-day flag. It corrects the source key and stops on duplicate/ambiguous records or source-key conflicts. It verifies that the legacy 2026 holiday is already on 20 October; it never edits the legacy table or 2027.

PostgreSQL fixtures prove ID preservation, exactly one corrected event, no remaining 24 October event, preserved non-working flag, unchanged legacy rows and every 2027 field unchanged. The actual calendar component at 390px rendered Dussehra on the 20th, the 24th empty, and **Non-working day: Yes**. Live Production checks await access and release.

## F. Validation

The frozen-lockfile install succeeded without changing package or lock files. Final TypeScript, lint and production build passed after the audit/label hardening. Lint had 25 existing warnings and no errors. The focused group contains 29 passing assertions; final full suite: **1,404 passed, 7 failed** (1,411 total), with the complete seven failure messages byte-for-byte identical to baseline. New failures: **0**.

Baseline full suite on the untouched Production SHA: **1,394 passed, 7 failed**. The same seven failing assertions and first error messages were reproduced after implementation. They concern existing branding, conversion migration hashing, dashboard KPI contract, employee removal, module icons, workforce visibility and attendance source contracts. No unrelated baseline fix is included.

All browser checks used isolated repository mocks; database checks used in-process PostgreSQL/PGlite. Live account logins, live schema installation, Finance UI integration against a migrated shared database, exact Production grants and post-release deltas remain unqualified until Production access and controlled release approval.

## G. Git

Only this new feature branch is used. PR targets `production-readiness`; it remains draft while current Production verification and grants are pending. PR #5, bulk availability, credential branches, online-clinician branches and shared history were not modified. No force push, reset, rebase or clean was used.

## H. Controlled release requirements

**PRODUCTION CODE DEPLOYED: NO.** No Production SQL write, grant, appointment, patient, availability, credential, status, clinician link or Varna profile mutation was performed.

1. With access to `ksmqzxncdvuxiabypjth`, run the read-only `scripts/urgent-operations-production-preflight.sql` and privately retain affected rows, policies, function definitions, audit triggers and existing grants.
2. Verify the three exact reported accounts; establish exact approved Faiz/Diya operator UUIDs from current business evidence. Prepare only verified operator grants. Review any drift from the code assumptions.
3. Complete real authenticated booking and migrated-database integration qualification in a permitted isolated environment, including Finance/CRM reconciliation and audit history; obtain PR/release approval.
4. Merge the reviewed feature PR to `production-readiness`, apply only forward migrations and approved minimal account grants through the controlled release, and use the normal Vercel Production deployment.
5. Compare the exact affected definitions/grants/holiday row against the snapshot. Verify the canonical 2026 Dussehra count/date/flag, legacy date and 2027 rows, and record the actual release SHA/deployment. Do not assert that unrelated records were unchanged without checking them.
