# Online Psychologist bulk availability UX — QA report

Date: 6 October 2026 (Asia/Dubai).

## A. Preflight

- Fetched origin before making changes.
- Independently verified both `origin/production-readiness` and GitHub's branch reference with `git ls-remote`: `a40649e8a03b17ca5a4ad1dc390ae8ec8963d5a3`.
- Created a new isolated worktree and branch: `codex/psychologist-bulk-availability-entry`.
- Worktree: `C:/Users/User/Desktop/Projects/Besmile/worktrees/psychologist-bulk-availability-entry`.
- Initial tracked/untracked state was clean. Only task-owned source, tests, QA harness and evidence are included in this change.
- The original checkout and `codex/temporary-credentials-staff-chart` worktree were left untouched.
- Feature commit: `acacd4d98b8a7f3ec1215c69efc24b7e7bbde2fd`, pushed only to the requested branch. Final worktree is clean.
- Draft PR creation was blocked by the GitHub integration with HTTP 403 (`Resource not accessible by integration`). The pushed branch and this report are available for review; no merge or deployment occurred.

## B. Existing UX

The manager editor previously required one weekday selector and start/end pair per canonical row. Three slots repeated Monday through Saturday required eighteen separately entered rows, plus Sunday. There were no day presets, repeated-slot groups, text interpretation, or final weekly review.

The existing save boundary was already `replace_clinician_availability`. Production's overnight validator and transactional RPC already understand end-before-start as the following day, including Saturday-to-Sunday overlap checks.

## C. Implementation

| File | Change |
| --- | --- |
| `src/lib/weekly-availability-entry.ts` | Pure group expansion, normalization, exact deduplication, round-trip grouping, time formatting, and strict text parser. |
| `src/components/weekly-availability-editor.tsx` | Structured day groups, presets, custom checkboxes, multiple slots, add/remove/duplicate groups, overnight labels, text preview/confirmation, and final save review. |
| `src/components/weekly-availability-editor.css` | Scoped responsive layout, 44px controls, visible focus, and Standard/Colorful theme support. |
| `src/components/outsourced-clinician-management.tsx` | Replaces only the availability editor and its save callback; reads actual consultation duration under existing RLS. |
| `src/app/globals.css` | Imports the scoped editor stylesheet. |
| `src/lib/weekly-availability-entry.test.ts` | 54 focused expansion, parser, ambiguity, duration, preservation and overlap cases. |
| `scripts/qa-bulk-availability.mts` | Guarded disposable QA fixture preparation, live RPC qualification, local QA server, and cleanup. |
| `playwright.bulk-availability.config.ts`, `tests/e2e/bulk-availability.e2e.ts` | Desktop/mobile and both-theme browser qualification, guarded save payload verification, and psychologist view-only checks. |
| `docs/qa/bulk-availability/` | Eight editor-only screenshots and exact parser output JSON. |

Structured groups apply every time slot to the selected days automatically. Presets are Mon–Fri, Mon–Sat, Sun–Thu, all days and weekends; custom days use individual checkboxes. Existing rows are grouped only when their entire slot sets match. Duplicate groups/ranges collapse into exact canonical duplicates before overlap validation. Removing one group leaves the other groups intact.

Text follows: **input → interpreted preview → explicit Confirm & use schedule → editable structured groups → final weekly review → Save availability**. The parser has no repository or persistence dependency. Editing the text invalidates its previous preview. Confirming text explicitly replaces the current draft groups; it does not write to the database.

Final review expands and normalizes groups, removes exact duplicates, then runs the existing validator for weekdays, time validity, unequal endpoints, consultation duration and overlaps across repeating weeks. Adjacent ranges are accepted. Overnight rows remain single canonical records. Existing `24:00` end-of-day endpoints are preserved through an explicit midnight control. Clearing all groups requires a final summary with an explicit clearing warning.

The directory RPC omits consultation duration. The manager reads only IDs and durations using existing table RLS rather than falling back to a shorter duration. Editing fails closed if those durations cannot be loaded. No database schema, permission, scheduling engine or RPC changes were necessary.

## D. Exact parser examples

All times below are canonical 24-hour values in Asia/Kolkata. Day numbers follow the existing database: Sunday=0 through Saturday=6. [Exact complete output JSON](bulk-availability/parser-examples.json) includes every expanded row and the editable group projection.

### 1. Repeated three-slot week with separate Sunday

```text
Mon-Sat: 9-10 AM, 2-3 PM, 6-7 PM
Sun: 10 AM-1 PM
```

Result: **19 canonical rows**.

| Day | day_of_week | Exact ranges |
| --- | --- | --- |
| Sunday | 0 | 10:00–13:00 |
| Monday | 1 | 09:00–10:00; 14:00–15:00; 18:00–19:00 |
| Tuesday | 2 | 09:00–10:00; 14:00–15:00; 18:00–19:00 |
| Wednesday | 3 | 09:00–10:00; 14:00–15:00; 18:00–19:00 |
| Thursday | 4 | 09:00–10:00; 14:00–15:00; 18:00–19:00 |
| Friday | 5 | 09:00–10:00; 14:00–15:00; 18:00–19:00 |
| Saturday | 6 | 09:00–10:00; 14:00–15:00; 18:00–19:00 |

### 2. Overnight

```text
Monday-Saturday: 1:30 PM-1 AM
```

Result: **6 canonical rows**, each with `start_time: "13:30"`, `end_time: "01:00"`, and day_of_week respectively **1, 2, 3, 4, 5, 6**. The preview displays **1:30 PM – 1:00 AM; Ends next day** for each originating day. Saturday ends on Sunday. No range is split.

### 3. Non-consecutive days

```text
Mon, Wed, Fri: 6 PM-9 PM
```

Result:

```json
[
  {"day_of_week":1,"start_time":"18:00","end_time":"21:00"},
  {"day_of_week":3,"start_time":"18:00","end_time":"21:00"},
  {"day_of_week":5,"start_time":"18:00","end_time":"21:00"}
]
```

### 4. Ambiguous availability

```text
Sunday: Anytime
```

Result: **REJECTED — NEEDS CLARIFICATION**.

```json
{"groups":[],"ranges":[],"error":"Line 1: 'Anytime' needs a specific start and end time."}
```

No full-day interval or duration is invented. Point-time lists receive: “We found start times but no end times. Add an end time for each slot.” Bare `9-10` and ambiguous `11-1 PM` are rejected; the latter requires AM/PM explicitly at both ends.

## E. Security and permissions

The existing `outsourced_clinicians.manage` manager gate and server-side `can_manage_clinician` RPC boundary remain intact. Live QA used six task-owned identities and one disposable outsourced clinician in project `enylrvmjgbntkrgpqsfe`:

| Identity equivalent | Live result |
| --- | --- |
| Aiswarya: internal psychologist with explicit outsourced-manager grant | PASS: saves exactly 19 canonical rows; actual duration is readable under RLS. |
| Faiz: general manager with explicit outsourced-manager grant | PASS: same save and duration check. |
| Diya: staff manager with explicit outsourced-manager grant | PASS: same save and duration check. |
| External psychologist | PASS: RPC save denied with 42501; own availability readable through RPC and browser. |
| Normal employee | PASS: RPC save denied with 42501; existing rows unchanged. |
| Director/broad manager with doctor management and global availability scopes but no outsourced grant | PASS: RPC save denied with 42501; existing rows unchanged. |

No real manager grants changed. No automatic director entitlement was added. The parser and preview never write. Only the final reviewed canonical payload reaches the existing transactional RPC.

QA cleanup verified fixture ownership, then revoked fixture grants, disabled six QA logins, banned only those QA Auth users, and disabled the QA clinician's self-service. No patient or appointment fixtures were created. No production connection, mutation, workbook import, provisioning endpoint, temporary credential generation or deployment was used.

## F. All 47 requirements

PASS denotes the evidence listed; scheduling regression cases use the unchanged production migration/functions executed against disposable local PostgreSQL fixtures. Live QA permission and overnight checks use only the disposable task clinician.

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | One day + one slot | PASS | Expansion unit case. |
| 2 | Monday–Saturday + one slot | PASS | Exact six-row expansion. |
| 3 | Monday–Saturday + three slots | PASS | Exact eighteen weekday rows; browser groups. |
| 4 | Separate Sunday group | PASS | Nineteen-row parser/save round trip; browser. |
| 5 | Two non-consecutive custom days | PASS | Unit expansion; browser Mon/Wed selection yields seven total rows with Sunday. |
| 6 | Duplicate groups/ranges safe | PASS | Exact deduplication unit cases; duplicated browser group still reviews nineteen rows. |
| 7 | Overlapping slots rejected | PASS | Unit cases, browser alert and no RPC write. |
| 8 | Adjacent slots accepted | PASS | Existing validator and PostgreSQL boundary tests. |
| 9 | Overnight accepted | PASS | Unit, PostgreSQL, live QA RPC and browser preview. |
| 10 | Cross-day overlap rejected | PASS | Next-day/week-boundary unit and PostgreSQL checks; live atomic rejection. |
| 11 | Equal start/end rejected | PASS | Parser, existing validator and PostgreSQL checks. |
| 12 | Existing ranges load | PASS | Round-trip grouping and browser reload from persisted canonical rows. |
| 13 | Editing does not lose ranges | PASS | Lossless group projection; browser edit/review/save/reload. |
| 14 | Removing a group preserves others | PASS | Browser duplicate/add/remove leaves Sunday untouched. |
| 15 | Existing authorized RPC used | PASS | Browser exact nineteen-row request payload; live RPC manager checks. |
| 16 | Mon–Sat: 9–10 AM | PASS | Parser exact expansion. |
| 17 | Three slots parse | PASS | Exact business-example unit and preview. |
| 18 | Sunday separately parses | PASS | Exact Sunday row in JSON and persisted payload. |
| 19 | Monday to Friday | PASS | Parser case. |
| 20 | Mon, Wed, Fri | PASS | Exact three-row parser case. |
| 21 | 24-hour input | PASS | HH:MM parser cases. |
| 22 | 9.30 AM | PASS | Dotted-minute parser case. |
| 23 | Overnight 1:30 PM–1 AM | PASS | Exact six-row parser result; preview shows next-day labels. |
| 24 | Anytime rejected | PASS | Empty result, actionable error, desktop/mobile browser. |
| 25 | Start-time-only list rejected | PASS | Empty result, requested error text, browser. |
| 26 | Invalid weekday rejected | PASS | Unknown, conflicting and prototype-key input cases. |
| 27 | Malformed time rejected | PASS | Invalid hour/minute/range and missing-meridiem cases. |
| 28 | Parser never writes directly | PASS | Pure module; browser captures zero saves through preview and confirmation. |
| 29 | Preview matches canonical rows | PASS | Parsed groups expand identically; nineteen visible preview slots and exact RPC payload. |
| 30 | Preview editable before save | PASS | Confirmed groups edited to 09:15; final summary updates on six days before save. |
| 31 | Aiswarya-equivalent can save | PASS | Live explicitly scoped QA identity. |
| 32 | Faiz-equivalent can save | PASS | Live explicitly scoped QA identity. |
| 33 | Diya-equivalent can save | PASS | Live explicitly scoped QA identity. |
| 34 | External psychologist cannot save | PASS | Live 42501 and PostgreSQL guard; browser no save control. |
| 35 | Normal employee cannot save | PASS | Live 42501; unchanged rows. |
| 36 | Broad manager without outsourced scope denied | PASS | Live director/broad-manager 42501 and PostgreSQL guard. |
| 37 | Same-day scheduling works | PASS | Existing scheduling and migrated PostgreSQL regression tests. |
| 38 | Overnight scheduling works | PASS | Next-day slots, week rollover and PostgreSQL containment tests. |
| 39 | Booked slots excluded | PASS | Existing slot generation and PostgreSQL appointment-status overlap cases. |
| 40 | Blocked periods work | PASS | Existing scheduling and PostgreSQL next-day block checks. |
| 41 | Appointments unchanged | PASS | No scheduling/appointment code diff and no live appointment mutations. |
| 42 | Psychologist availability viewing works | PASS | Live own-schedule RPC and authenticated browser view-only check. |
| 43 | Structured editor usable at 390px | PASS | Mobile Standard/Colorful workflows and screenshots. |
| 44 | Multi-slot rows do not overflow | PASS | Browser editor/control bounds checks at 390×844 and screenshots. |
| 45 | Text box usable | PASS | Mobile filling, ambiguity correction, preview, and text edits. |
| 46 | Preview readable | PASS | Nineteen slots rendered; single-column mobile screenshots in both themes. |
| 47 | Add/remove controls usable | PASS | Actual mobile clicks for slots/groups/duplication and custom day checkboxes; 44px controls. |

**47 PASS / 0 FAIL / 0 BLOCKED** for the requested task matrix. The repository-wide baseline failures below remain outside this feature's scope.

## G. Regression and checks

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile unchanged. |
| `pnpm run typecheck` | PASS. |
| `pnpm run lint` | PASS; 0 errors, 25 warnings in existing files. |
| `pnpm run build` | PASS; final production build completed after all UI changes. |
| Focused availability/scheduling/PostgreSQL tests, `--maxWorkers=2` | PASS: 5 files, 114 tests. |
| Baseline `pnpm test --maxWorkers=2` | 7 failed, 1,322 passed (1,329 total); 7 failed / 251 passed files. |
| Final `pnpm test --maxWorkers=2` | 7 failed, 1,376 passed (1,383 total); 7 failed / 252 passed files. |
| New full-suite failures | **0**. |

The same seven pre-existing failed tests appear in both runs:

1. `branding-asset.test.ts`: expected supplied mark reference.
2. `conversion-client-semantics.test.ts`: expected migration checksum.
3. `dashboard-kpi-visual-contract.test.ts`: expected KPI chart marker.
4. `employee-removal-management.test.ts`: expected active-employee selector.
5. `module-icon-audit.test.ts`: explicit destination icon mapping.
6. `operational-workforce-visibility.test.ts`: workforce visibility selector.
7. `staff-attendance-access.test.ts`: expected staff attendance guard marker.

No unrelated fixes were included. Full-suite failures therefore remain a repository-wide release-gate limitation, not a new feature regression.

## H. Browser qualification

Four manager workflows passed: **1366×768 Standard**, **1366×768 Colorful**, **390×844 Standard**, and **390×844 Colorful**. A fifth targeted external-psychologist case passed and confirmed own viewing plus redirection away from the management route.

Initial harness issues (local 127.0.0.1-to-localhost cookie redirects, a textarea label locator, and an incorrect existing view heading expectation) were corrected. The final evidence is four successful manager cases plus the separately rerun successful external case. No unresolved browser product failure remains.

The browser guard checks that every Supabase request targets the approved QA hostname and aborts any availability save whose target is not the task-owned fixture. Each manager workflow verifies no saves during typing, preview or confirmation; one final RPC request with the exact canonical payload; then reloads the persisted week. Editor/control measurements report no horizontal overflow. Screenshots were also visually inspected.

| Screenshot | Structured | Text preview |
| --- | --- | --- |
| Desktop Standard | [Open](bulk-availability/desktop-standard-structured.png) | [Open](bulk-availability/desktop-standard-preview.png) |
| Desktop Colorful | [Open](bulk-availability/desktop-colorful-structured.png) | [Open](bulk-availability/desktop-colorful-preview.png) |
| Mobile Standard | [Open](bulk-availability/mobile-standard-structured.png) | [Open](bulk-availability/mobile-standard-preview.png) |
| Mobile Colorful | [Open](bulk-availability/mobile-colorful-structured.png) | [Open](bulk-availability/mobile-colorful-preview.png) |

Local raw evidence is ignored by Git in `release-evidence/bulk-availability/`: install output in the task transcript, `baseline-tests.log`, `feature-tests.log`, `focused-tests.log`, `typecheck.log`, `lint.log`, `build.log`, `live-rpc-results.json`, `browser-manager-results.json`, `browser.log`, `browser-external.log`, and `cleanup.json`. Fixtures and passwords remain only in the ignored `fixtures.local.json`; they are not committed.

To repeat QA with fresh fixtures: set `BSMILE_QA_ENV_FILE` to the approved QA environment file, run the harness with `--prepare`, `--probe`, and `--serve`, then run `pnpm exec playwright test --config playwright.bulk-availability.config.ts`. Finish with `--cleanup`. Existing disabled fixtures are intentionally not re-enabled by this procedure; use a new ignored fixture file/run.

## I. Production

```text
PRODUCTION CODE DEPLOYED: NO
PRODUCTION AVAILABILITY MODIFIED: NO
PRODUCTION APPOINTMENTS MODIFIED: NO
PRODUCTION AUTH USERS MODIFIED: NO
```

No merge or deployment is authorized before this QA report is reviewed.

**READY FOR BULK AVAILABILITY UX REVIEW**
