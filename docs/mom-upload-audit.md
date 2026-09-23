# MOM upload — implementation and verification

## Baseline and delivery

- Baseline: `ab00044cb28a94599589a434cb47351dd3aa169c`.
- Verified against fetched `origin/production-readiness`, live `/api/version`, and Vercel Production deployment `dpl_H56GZZm5K1EdMTY26VU6gsLBWgq5` on 2026-09-23, again immediately before implementation.
- Isolated branch: `codex/bs-official-documents-mom-upload`.
- Worktree: `C:/Users/User/.codex/worktrees/bs-official-documents-mom-upload/Bsmile`.
- Production database, Storage, permissions, application deployment, and `production-readiness` checkout were not modified. Production database access was SELECT-only.

## Exact permission model

Existing permissions: `documents.manage`, `documents.employee.manage`, `documents.official.generate`.

`officialDocumentAccess().canUploadMom` and the SECURITY INVOKER database helper `official_mom_upload_allowed()` derive the MOM-only capability from those existing effective permissions. No role/user grants are copied, no names or emails are embedded, and no new broad permission is granted. A separate permission row is unnecessary: eligibility follows the existing permission architecture, including designation bundles, direct grants, revocations, and inactive-account checks.

Managers retain existing document access. Generation-only users may insert/read their own uploaded MOM records and own MOM files only. They gain no general upload, document administration, saved-document update/delete, sharing, or directory-listing permission. The only new DELETE policy removes unreferenced files after failed uploads; it rejects deletion once a document references the object.

Existing manager and explicit document-share visibility policies are unchanged. No default share-with-everyone row is created. Ordinary employees cannot upload MOM or read unshared MOM; pre-existing explicit sharing still works.

## Production authorized population audit

Read-only `has_permission(code, profile.id)` checks across ALL production profiles/statuses found **four eligible users**, not the anticipated five plus GM/Director. No account was activated or granted access to match the expectation.

| Existing role | Designation | Count | documents.manage | documents.employee.manage | documents.official.generate |
| --- | --- | --- | --- | --- | --- |
| director | Chairman | 1 | true | false | false |
| director | Director | 1 | true | false | false |
| general_manager | General Manager | 1 | true | true | false |
| staff | Assistant Manager | 1 | false | false | true |

All four are active. Psychologist, Intern, and Sales Coordinator lack all three permissions. The all-status census found no additional eligible inactive/system accounts and no users possessing only `documents.employee.view`. The authorized population remains dynamic; equivalent existing permissions confer MOM automatically.

Production audit query: https://supabase.com/dashboard/project/ksmqzxncdvuxiabypjth/sql/85223ce1-c3a8-42bd-9cec-3c0af7ed59e1

QA equivalents tested: Director, General Manager, Assistant Manager, Super Admin, and an unauthorized ordinary employee. Chairman uses the same actual role and permission combination as the Director equivalent; no name-specific fixture is required by the implementation.

## Architecture and implementation

- Official Documents uses `/admin/documents/generate` and `/employee/documents/generate`, sharing `official-document-generator.tsx`.
- The baseline Official Documents page generated PDFs but had no upload flow. A small collapsible Upload Document form now offers `Minutes of Meeting (MOM)` separately from generation.
- `/admin/documents` remains the separate Operational Documents form. Its Policy/Form/Notice/HR/Finance/Other catalogue and sharing workflow are unchanged.
- Canonical MOM type: `minutes_of_meeting`; category: `Official:Minutes of Meeting (MOM)`; source: `uploaded`, never `official_generated`.
- Existing metadata in `public.documents`: title, optional description, category/type, original filename, MIME, size, authenticated uploader, existing creation timestamp. No new metadata columns.
- Private bucket: `employee-documents`. Safe path: `company/<authenticated user id>/mom/<UUID>-<filename>`. Uploads use `upsert: false`; a MOM-only unique index prevents duplicate metadata for one Storage path.
- Browser sends bytes directly to private Supabase Storage under the current session/RLS. This preserves the existing 10 MiB limit despite Vercel's 4.5 MB function-request limit. The authenticated finalize endpoint re-reads the stored object to verify actual size and declared MIME, and derives uploader identity server-side.
- Allowed files unchanged: PDF, JPEG/JPG, PNG, WebP; nonempty, at most 10 MiB, matching MIME/extension, safe filename. DOC/DOCX remain unsupported.
- The existing history includes uploaded MOM. Managers see their existing authorized records; generation-only users retain own-document scope. Existing 20-record history limit is unchanged.
- View/download uses existing 60-second signed URLs. Existing generated-download auditing stays intact; MOM uploads receive an authenticated upload audit event via a non-callable protected trigger.
- No existing type filter/search exists on this page; neither was added.
- Generated type catalogue, PDF engine, canonical heading behavior, and Meeting Notes were not changed.
- Colorful Mode label contrast is scoped to the new form only.

## Migration

`supabase/migrations/20260923105301_official_mom_upload.sql`

Required for the owner's approved generation-only MOM scope, not for a type lookup. It adds one MOM-only unique index, two SECURITY INVOKER helpers, six narrowly scoped policies (including restrictive metadata/attribution validation), a protected upload-audit trigger, and a SECURITY INVOKER identity-preservation trigger. Existing policies, buckets, role/designation/user grants, and generated-document functions are not replaced.

Applied through the dashboard SQL editor to **QA project `enylrvmjgbntkrgpqsfe` only**. The matching committed migration must be applied through the integration release workflow before deploying this feature to Production. No production migration was applied.

## Verification

- Focused endpoint tests: 27 passed. Authentication/authorization, type restriction, invalid/oversized/empty files, MIME mismatch, unsafe filenames, forged metadata, foreign paths, Storage failures, duplicate finalization, and existing allowed formats.
- PostgreSQL RLS tests: 32 passed using PGlite with the existing permissive document/Storage policies plus the actual MOM migration. Tests execute real SQL as `authenticated`, including manager access, generation-only scope, employee/cross-creator denial, existing explicit shares, restrictive attribution, unsafe/general Storage paths, no saved-object update/delete, orphan-only cleanup, no directory listing, existing generated PDFs, and audit protection.
- Full Vitest: **204 files / 936 tests passed**.
- TypeScript: PASS.
- ESLint: PASS, zero errors; 25 existing warnings. New files and QA script also lint cleanly.
- Production build: PASS, rebuilt after the scoped Colorful Mode contrast adjustment.
- Supabase QA security advisor: zero errors; existing database warnings remain outside this task's scope.
- Authenticated browser QA: PASS for Director, GM, Assistant Manager, and Admin. Each completed real upload, listing, reload persistence, popup creation, signed download with exact byte comparison, ordinary-employee read denial, and collision rejection.
- Manager identity guard live checks: uploader, storage path, document type, and source changes rejected; title edits allowed; disposable record/file cleaned.
- Assistant Manager live checks: general company upload denied; forged uploader rejected; saved MOM metadata/file deletion denied; general manage/administration permissions remain false.
- Ordinary employee live checks: upload UI unavailable, finalize endpoint 403, direct MOM Storage upload denied, metadata and file reads denied.
- Mobile 390×844 and desktop 1366×768: PASS in Standard and Colorful Mode, for all four QA account types. No document-width overflow or clipped form controls; upload action visible.
- The full 10 MiB limit passed real browser upload, persistence, and download using Admin.
- Existing generated documents: all six required types returned valid PDFs through authenticated preview; General Report also passed authenticated generate/store/signed-download with byte comparison. Single-canonical-heading engine tests passed in the full suite.
- Existing uploaded type: Policy PNG passed authenticated Storage upload, normal document metadata insertion and exact-byte download under existing management policies; no MOM type or policy was needed for this regression.
- All disposable MOM, generated-report, and Policy regression metadata/files were cleaned. QA audit attribution records intentionally remain as existing audit history.
- Final live `/api/version` and fetched `origin/production-readiness` remained at the baseline SHA at 2026-09-23 11:32 UTC.

The browser harness verifies the UI's actual signing response, popup creation, and downloaded bytes rather than Chromium's internal PDF-viewer URL or DOMContentLoaded event. Cleanup uses authoritative object listing rather than potentially cached download bytes. An independent QA SQL check also confirmed zero MOM rows and zero MOM objects after the earlier run.

Committed evidence is in `qa-artifacts/official-mom/`: final role/security/cleanup results, generated-document and existing-upload regression results, and four representative Assistant Manager screenshots covering both viewports/themes. All sixteen role/viewport/theme screenshots remain in the ignored local `release-evidence/mom/` directory.

## Acceptance status

| Required result | Status |
| --- | --- |
| Director existing access / MOM upload | YES / PASS |
| General Manager existing access / MOM upload | YES / PASS |
| Generation-only Assistant Manager MOM upload | PASS |
| No general upload/manage/delete broadening | PASS |
| Other existing manager permission combinations | PASS (unit/SQL and Admin browser fixture) |
| Upload / list display / persistence | PASS |
| Filter / search | NOT APPLICABLE — no existing filter/search on this page |
| View / download | PASS |
| Unauthorized block | PASS |
| Existing official types / generated-document regression | PASS |
| Mobile 390×844 / desktop 1366×768, both modes | PASS |
| QA files cleaned | YES |
| RLS/permissions changed | Six MOM-only policies and protected helpers/trigger; no role/user/designation permission grants |
| Migration | `20260923105301_official_mom_upload.sql` — QA only |
| Production modified | NO |

Final SHA is supplied in the delivery response (the commit containing this report).

**OFFICIAL DOCUMENT MOM UPLOAD COMPLETE — PENDING INTEGRATION**

Population discrepancy remains explicit: production currently has four qualifying users, not seven. No new general access was granted to manufacture the expected count.
