# MOM upload — final owner scope and verification

## Delivery and baseline

- Branch: `codex/bs-official-documents-mom-upload`.
- Worktree: `C:/Users/User/.codex/worktrees/bs-official-documents-mom-upload/Bsmile`.
- Original verified Production baseline: `ab00044cb28a94599589a434cb47351dd3aa169c`; Vercel deployment `dpl_H56GZZm5K1EdMTY26VU6gsLBWgq5`.
- Production database access was SELECT-only. No Production migration, permission grant, Storage write, application deployment, or integration-branch change was performed.
- Final commit SHA is supplied in the delivery response.

## Identity audit: three unique authorized active accounts

The final owner instruction supersedes the earlier inherited-access design.

Read-only Production queries on 2026-09-23, including normalized designation spelling variants and all account statuses, confirm **Diya Anthikat IS the active Assistant Manager account** in Administration. There is no separate active Assistant Manager. An older Diya account is inactive and receives nothing.

| Owner-intended account | Verified designation | Release authorization |
| --- | --- | --- |
| General Manager | General Manager | One explicit MOM grant |
| Director | Director | One explicit MOM grant |
| Diya Anthikat / Assistant Manager | Assistant Manager | One explicit MOM grant |
| Chairman | Chairman (uses the same director role code) | No MOM upload grant |
| Other managers, generators, administrators, employees | Any | Blocked without separately approved explicit MOM grant |
| Older inactive Diya / GM / Chairman accounts | Inactive | Blocked |

**Unique authorized count: 3.** No fourth assignment was manufactured.

[Production read-only identity query](https://supabase.com/dashboard/project/ksmqzxncdvuxiabypjth/sql/b38bbebb-295d-413b-88e5-20c45af793d0)

## Exact permission model

`documents.mom.upload` is stored in the existing permissions and user_permission_grants architecture. Only a current, unrevoked direct grant for an active profile authorizes MOM upload. Start time and expiry are enforced on each check.

The release migration seeds only the three audited stable Production profile IDs. IDs appear only as migration data, never as runtime application allowlists. No names/emails are hard-coded in authorization. New users with the same role/designation do not inherit a grant. No role or designation bundle receives this permission.

`official_mom_upload_allowed()` is a narrowly scoped SECURITY DEFINER current-user boolean lookup because grant rows are security-admin-only. It has no subject argument, returns no private data, pins an empty search path, and is executable only by authenticated users. It deliberately bypasses neither explicit-grant requirements nor active-account checks. Unlike generic has_permission, it does not implicitly authorize super-admins.

The UI, finalize API, metadata RLS, and Storage RLS use the same helper. Restrictive metadata INSERT validation overrides permissive manager policies for MOM. Restrictive Storage INSERT/UPDATE policies prevent general company-file permissions from bypassing the MOM namespace boundary.

General document upload/manage/delete permissions, admin shell, HR, finance, CRM and clinical access remain unchanged. Existing Official Documents generation and viewing/sharing rules remain unchanged. Explicitly approved generation-only users gain no general management or saved-document deletion rights. Failed-upload cleanup is limited to their own unreferenced MOM object.

## Implementation

- A collapsible Upload Document form on both existing Official Documents pages offers Minutes of Meeting (MOM), separately from PDF generation.
- Canonical type `minutes_of_meeting`, category `Official:Minutes of Meeting (MOM)`, source `uploaded`.
- Existing metadata columns store title, optional description, filename, MIME, size, authenticated uploader and creation time.
- Private `employee-documents` bucket; own `company/<uid>/mom/<UUID>-<filename>` path; no upsert.
- Direct browser-to-Storage upload preserves the existing 10 MiB limit. The authenticated JSON finalize endpoint re-reads the object, validates actual size and declared MIME, derives uploader server-side and is idempotent per Storage path.
- Existing supported files: PDF, JPEG/JPG, PNG, WebP; nonempty, at most 10 MiB, safe filename and matching MIME/extension. DOC/DOCX remain unsupported.
- History shows uploaded MOM; signed view/download uses existing 60-second URLs and existing visibility. No new shared audience.
- Upload audit records authenticated actor. MOM uploader, type, source and Storage path cannot be reassigned even by a document manager; existing title edits remain allowed.
- Generated catalogue, Meeting Notes, PDF heading engine and Operational Documents catalogue remain unchanged.
- No existing filter/search on the Official Documents history page; none added. Existing 20-row limit retained.
- Colorful Mode contrast adjustment is scoped to the new form.

## Migrations and release

Apply BOTH candidate migrations before deploying the feature:

1. `20260923105301_official_mom_upload.sql`: MOM infrastructure, validation, six scoped policies, audit and identity triggers.
2. `20260923114731_official_mom_explicit_access.sql`: supersedes inherited eligibility with explicit MOM grants; seeds the three audited active Production identities; adds restrictive Storage INSERT/UPDATE policies.

Both definitions were applied to **QA `enylrvmjgbntkrgpqsfe` only**. The Production grant IDs do not match QA accounts and therefore create no QA grants. The browser harness temporarily grants only its three approved equivalents, then cleans those grants. It does not select all QA users by designation.

No Production release is authorized or performed in this task. Before release, verify the three audited identities remain active and apply both migrations through the integration workflow; do not deploy the superseded first commit alone.

## Verification

- Endpoint/access tests: 27 passed, including denial when general manager/generation permissions exist without explicit MOM permission.
- Real PostgreSQL RLS tests: 39 passed using PGlite with existing permissive policies and both actual migrations. Covers unapproved managers/generators, implicit all-permission admin bypass, revoked/expired/future grants, inactive accounts, attribution, cross-user access, explicit sharing, orphan cleanup and ordinary document/generation regression.
- Full Vitest: **204 files / 943 tests passed**.
- QA security advisor: zero errors, 138 warnings. One new warning identifies the authenticated SECURITY DEFINER eligibility helper; reviewed and intentional because it returns only the current user's authorization boolean from protected grant rows. All other warnings predate this correction.
- TypeScript: PASS. ESLint: zero errors, 25 pre-existing warnings. Production build: PASS.
- Authenticated browser QA: approved Director, GM and Assistant Manager equivalents; real upload, history, reload persistence, signed view/download with exact bytes, collision denial, unauthorized read denial.
- Responsive QA: 390×844 and 1366×768, Standard and Colorful modes for each approved equivalent.
- Full 10 MiB file upload/download tested with Director.
- Before temporary grants, the same managers/generator are denied direct MOM Storage and metadata insertion.
- Unapproved super-admin and ordinary employee: no MOM upload UI, finalize 403, direct Storage denied. Super-admin still generates ordinary official documents.
- Assistant Manager retains no general upload, management, administration or saved-MOM deletion rights.
- Six existing generated PDF preview types pass. Earlier baseline-to-candidate General Report persisted/downloaded byte regression and Policy PNG upload/download regression also passed; correction does not change those paths.
- Disposable MOM rows/files and temporary QA grants cleaned. Audit records remain as normal audit history.
- Committed evidence: `qa-artifacts/official-mom/`; browser harness: `scripts/qa-official-mom.mjs`.

## Acceptance

| Requirement | Candidate result |
| --- | --- |
| General Manager MOM upload | PASS, explicit-grant QA equivalent |
| Director MOM upload | PASS, explicit-grant QA equivalent |
| Diya MOM upload | PASS, Assistant Manager QA equivalent |
| Separate Assistant Manager | Not applicable: same active account as Diya |
| Everyone else without owner-approved grant | BLOCKED |
| General Official Documents functionality | UNCHANGED; regression PASS |
| Broad permission expansion | NONE |
| Unique planned Production grants | 3 |
| Production changed | NO |

**OFFICIAL DOCUMENT MOM UPLOAD COMPLETE — PENDING INTEGRATION**
