# Online clinician overnight availability and optional photo hotfix

Qualification date: 6 October 2026. Branch: `codex/online-clinician-overnight-photo-hotfix`. Production baseline: `7a76ad1dc8d2ccf5b28db852bd8be9835d0ea6c4`, verified before editing and again after qualification. The initial checkout was clean. This report precedes production release; PR review, merge and deployment remain pending.

## A. Root cause

Weekly validation rejected every `end_time <= start_time`; the repository also discarded overnight rows. The slot generator only considered the selected weekday with same-day bounds. Database constraint `doctor_weekly_availability_check`, replacement RPC validation and slot containment likewise assumed same-day intervals. These combined failures rejected `13:30 → 01:00` and hid inherited early-morning slots.

The old photo validator combined unsupported MIME, empty files and oversize files into one generic error. It rejected `image/jpg` and empty browser MIME, and did not inspect image content. The original UI already skipped upload when no file was selected; this hotfix preserves that behavior with an explicit `File` guard, resets the native input, and adds preview/removal. The exact file selected in the original production incident was unavailable, so its individual rejection reason cannot be identified. The QA reproductions cover each rejection path without inspecting or editing a real clinician.

## B. Exact code and database scope

Application files:

- `src/lib/doctor-scheduling-rules.ts`: weekly overlap normalization and selected-day/previous-day slot generation.
- `src/lib/doctor-scheduling-repository.ts`: preserve overnight RPC payloads; fetch appointments by interval overlap in business time.
- `src/lib/clinician-availability-normalizer.ts`: explicit source-row approval can represent overnight clocks; dry-run/import approval remains mandatory.
- `src/lib/clinician-photo-rules.ts`: new shared secure photo validation and specific errors.
- `src/lib/clinician-repository.ts`: linked-profile path, normalized content type, sanitized upload failures.
- `src/components/clinician-profile-editor.tsx`: optional upload, preview, filename/size, removal, unlinked explanation and responsive/error contrast.
- `src/components/outsourced-clinician-management.tsx`: range validation and next-day marker.
- `src/components/doctor-scheduling.tsx`: overnight input and next-day marker.
- `src/app/clinician/schedule/page.tsx`: next-day availability label.
- `vercel.json`: disable automatic Git deployments for this task branch.

Qualification files:

- `src/lib/doctor-scheduling-rules.test.ts`
- `src/lib/clinician-availability-normalizer.test.ts`
- `src/lib/doctor-overnight-scheduling.test.ts`
- `src/lib/doctor-overnight-repository.test.ts`
- `src/lib/clinician-overnight-database.test.ts`
- `src/lib/clinician-photo-rules.test.ts`
- `src/lib/clinician-photo-repository.test.ts`
- `scripts/qualify-overnight-photo-hotfix.mts`: guarded isolated-QA setup, probes and recovery; requires local ignored credentials and existing disposable fixtures.
- This report.

Migration: `supabase/migrations/20261006074106_clinician_overnight_availability.sql`.

The transaction changes one CHECK constraint and replaces two existing functions: `replace_clinician_availability(uuid,jsonb)` and `doctor_slot_is_available(uuid,timestamptz,timestamptz,uuid)`. It adds no tables or policies. Replacement retains `auth.uid()` and `can_manage_clinician` authorization, existing execute grants and notifications; it locks the clinician row before validating/replacing ranges. Slot checking uses an empty search path and qualified references. `can_manage_clinician`, availability RLS and profile-photo Storage policies remain unchanged. The migration contains replacement DML inside the RPC definition; applying the definition does not execute that DML. **Production data mutation by deployment itself: NO.**

The final migration was applied and recorded in the isolated QA project `enylrvmjgbntkrgpqsfe`. Security Advisor: zero errors, the same 171 existing warnings. No production database connection or migration was performed.

Recovery plan, before any separately approved production release:

1. Capture current function definitions, ACLs, constraint definition and a count/checksum of availability; verify the production branch still matches the approved release baseline.
2. Apply this migration transactionally, then use read-only schema/authorization checks and existing schedules for smoke testing. Never replace a real clinician's availability as a smoke test.
3. If release must be reverted before overnight rows have been saved, restore the captured two function definitions/ACLs and original `start_time < end_time` constraint in a transaction, then reload PostgREST schema and roll back the application.
4. First check for `end_time < start_time`. If any exist, stop the inverse constraint change: restoring the old constraint would fail and old application behavior would reject those records. Prefer a reviewed forward fix; obtain separate approval for any data conversion. Do not delete, split or truncate schedules automatically. Preserve any independently saved user data.

## C. Overnight semantics

`end > start` is same-day; `end < start` ends the following calendar day; equal clocks remain invalid. Representation stays `day_of_week,start_time,end_time`. Existing PostgreSQL end-of-day `24:00` endpoints remain supported; `24:00` cannot be a start. Time calculations use Asia/Kolkata.

For a 30-minute consultation and the existing 60-minute cadence:

| Stored range | Slots starting on origin day | Slots displayed on following day |
| --- | --- | --- |
| Monday `13:30 → 01:00` | `13:30,14:30,…,23:30` | Tuesday `00:30 → 01:00` |
| Saturday `13:00 → 03:00` | `13:00,14:00,…,23:00` | Sunday `00:00,01:00,02:00` (each 30 minutes) |

The selected date displays starts on that date; a late start may end after midnight. Inherited slots retain the origin range's cadence. Full consultation containment is mandatory. Half-open overlap checking covers repeated weeks, including Saturday/Sunday and Sunday/Monday; exact adjacency is accepted. Non-cancelled bookings and blocked intervals still remove conflicts. Blocked periods retain their existing same-day or full-day model; overnight blocked-period input is not introduced.

Normalizer rows 17 and 108 can represent Anjana/Kallu overnight ranges only with matching explicit source-row approval. Other ambiguity holds, identity safeguards and dry-run/mapping/import approval remain. **Workbook imported: NO.**

## D. Photo behavior

Text-only changes never upload a photo or include an avatar replacement, and preserve the existing avatar. JPG/JPEG, PNG and WebP up to 5 MiB are supported. Existing document/patient-document validators and group-photo upload were audited: they depend on MIME and offer no reusable empty-MIME image-content decoding path. `image/jpg` normalizes to `image/jpeg`; the new empty-MIME fallback requires an allowed extension, matching content signature and successful browser decoding. A renamed arbitrary file fails content validation. Preview validation runs before submission and upload validation runs again at save.

| Case | Behavior |
| --- | --- |
| No new photo | Save permitted text fields; retain avatar |
| Valid `.jpg` / `.jpeg`, PNG, WebP | Filename/size and preview; canonical linked-profile Storage folder |
| More than 5 MiB | `Profile photo must be 5 MB or smaller.` |
| Unsupported format / MIME mismatch | `Use a JPG, JPEG, PNG or WebP image.` |
| Empty/corrupt/unreadable | `The selected image could not be read. Choose another photo.` |
| Storage/upload failure | `Profile photo could not be uploaded. Please try again.` |
| Remove selected photo | Clear preview, validation error and native input; existing avatar remains |
| No linked profile | Disabled upload and `Create/link the clinician account before uploading a profile photo.`; text-only save works |

No fake profile UUID or new storage mechanism/policy is used.

## E. All 28 required QA checks

Evidence labels: **API** = authenticated live isolated-QA Supabase; **SQL** = PGlite executing the migration and original authorization/profile functions and photo policies with authenticated roles; **Unit** = focused rules/repository tests; **Browser** = actual Chrome against the QA-configured local app. SQL tests model active external identities; existing disposable external QA Auth accounts were already banned, so checks 13 and 25 were not exercised through live external login. No Auth state was changed to enable those logins.

| # | Required check | Result and evidence |
| --- | --- | --- |
| 1 | Same-day 09:00–17:00 valid | PASS — API, SQL, Unit |
| 2 | Overnight 13:30–01:00 valid | PASS — API, SQL, Unit, Browser save/reload |
| 3 | Overnight 13:00–03:00 valid | PASS — API, SQL, Unit |
| 4 | Equal start/end rejected | PASS — API/SQL atomic rejection, Unit |
| 5 | Monday produces Tuesday early slots | PASS — API, SQL, Unit, Browser `00:30` |
| 6 | Saturday produces Sunday slots | PASS — API, SQL, Unit |
| 7 | Sunday produces Monday slots | PASS — API, SQL, Unit |
| 8 | Overlap with next-day range rejected | PASS — API, SQL, Unit; both week edges covered |
| 9 | Adjacent ranges accepted | PASS — API, SQL, Unit |
| 10 | Existing same-day schedules unchanged | PASS — Unit/SQL containment and cadence; end `24:00` retained |
| 11 | Bookings remove overlapping overnight slots | PASS — Unit/SQL; all existing blocking statuses, cross-midnight fetch |
| 12 | Cancelled appointments do not block | PASS — Unit/SQL |
| 13 | External cannot edit availability | PASS — SQL with actual original authorization predicates; even direct manager grant denied |
| 14 | Three equivalent scoped managers may edit | PASS — API GENERAL_MANAGER, ASSISTANT_MANAGER, PSYCHOLOGIST with temporary explicit QA grants |
| 15 | Broad doctor manager denied outsourced target | PASS — API Director, SQL |
| 16 | Text-only profile save succeeds | PASS — API, SQL, Unit, Browser |
| 17 | Existing avatar unchanged | PASS — API, SQL, Unit |
| 18 | Valid JPEG succeeds | PASS — API upload/profile update, Browser upload, Unit |
| 19 | Both `.jpg` and `.jpeg` supported | PASS — Unit both extensions, Browser `.jpeg` |
| 20 | PNG succeeds | PASS — API upload/profile update, Browser preview, Unit |
| 21 | WebP succeeds | PASS — API upload/profile update, Browser preview, Unit |
| 22 | >5 MiB specific error | PASS — Unit, Browser |
| 23 | Unsupported format rejected | PASS — Unit, Browser GIF |
| 24 | Empty/corrupt rejected safely | PASS — Unit empty/signature/decoder failures; Browser signature-only corrupt JPEG |
| 25 | External cannot upload another clinician photo | PASS — SQL authenticated RLS with existing policies |
| 26 | Scoped manager photo update works | PASS — API all three formats, SQL RLS/profile update, Browser JPEG |
| 27 | Unlinked clinician intentional behavior | PASS — API/SQL text save, Unit repository guard, Browser disabled upload/message |
| 28 | No private credential reaches browser | PASS — final compiled static asset scan: zero matches; client uses QA anon/session credentials |

Live API: 19/19 probes passed. No booked/blocked fixture writes were needed in live QA; SQL/Unit fixtures cover these cases without patient, appointment or Auth changes.

Cleanup: restored the two disposable clinicians' permitted profile/registry fields and original availability IDs/timestamps. Entire QA availability table returned to its original 128 rows and checksum `003a53830f551066eecf80ba3e5e2f74`; zero active task grants remain. Six API-uploaded synthetic photo objects plus one browser-uploaded JPEG are retained in QA, unreferenced after avatar restoration. QA audit/notification history is retained. Existing external login bans remain unchanged.

## F. Regression

| Command | Final result |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS, zero errors / 25 existing warnings |
| `pnpm run build` | PASS |
| Seven focused test files | 93/93 PASS |
| `pnpm test --maxWorkers=2` | 1,295 passed / seven known failures / 1,302 total |
| Final credential scan | Zero matches in source, 183 browser static assets and 11 task logs |

The seven failure names and assertion messages exactly match the saved pre-existing production-feature baseline. No new failed test was introduced. They remain failures, so the full suite is not green:

- Approved BSmile mark: supplied visible branding/application icons.
- Converted-client repair: unchanged first migration and guarded forward-only second migration.
- Dashboard KPI chart visual contract.
- Employee removal: meeting/payroll/Chat eligibility.
- Semantic module icon audit.
- Operational workforce visibility in calendar meeting repository.
- Staff attendance shared route/server permission guard.

The initial full-suite invocation overlapped early edits and is not claimed as a clean pre-edit baseline run; comparison uses the previously saved qualified baseline's seven failure names.

Local evidence (ignored to keep credentials and fixture identities out of Git): `release-evidence/overnight-photo/` contains API/browser results, final full-suite JSON, regression comparison, schema-before/final-state snapshots, cleanup, secret-scan and screenshots. Final typecheck/lint/build/focused logs are `release-evidence/overnight-*-final.log`.

## G. Browser qualification

Actual viewports: desktop 1366×768; mobile 390×844. Standard and Colorful modes fit without horizontal overflow. Verified normal time inputs, next-day marker, QA availability save and reload, text-only profile save, JPEG preview/save, PNG/WebP previews, specific photo errors/removal and intentional unlinked state. Colorful photo-error contrast was corrected and checked. The scheduler displays Tuesday's inherited `00:30` slot on desktop and mobile; no appointment was submitted. Active external workspace browser login was not tested because the pre-existing disposable accounts are banned.

Screenshots include `mobile-standard-overnight.png`, `desktop-colorful-overnight.png`, `mobile-colorful-overnight.png`, `mobile-colorful-photo-error.png`, `mobile-tuesday-inherited-slot.png`, `desktop-tuesday-inherited-slot.png` and `qa-restoration.png` in the local evidence directory. Temporary browser viewport overrides are reset after qualification.

## H. Git and release gate

Branch: `codex/online-clinician-overnight-photo-hotfix`, isolated from `origin/production-readiness`. The PR head identifies the reviewed commit; the final chat report supplies its SHA and PR URL after creation. Automatic task-branch deployments are disabled. Production merge/deploy is pending reviewed-PR approval; no resulting production SHA is claimed. Current verified production branch SHA remains `7a76ad1dc8d2ccf5b28db852bd8be9835d0ea6c4`.

## I. Status before production release

- PRODUCTION CODE DEPLOYED: **NO**
- PRODUCTION DATABASE MODIFIED: **NO**
- PRODUCTION AVAILABILITY MODIFIED: **NO**
- PRODUCTION AUTH USERS MODIFIED: **NO**
- REAL CLINICIAN ACCOUNTS PROVISIONED: **NO**
- WORKBOOK IMPORTED: **NO**
- PATIENT / APPOINTMENT / AUTH MUTATIONS IN THIS TASK: **NO**

The isolated QA schema qualification and restored disposable profile/availability tests are the only database work performed. Production smoke testing remains a read-only release step after separately approved deployment.
