# Dynamic organization chart — new-baseline qualification

Date: 2026-09-24. **DYNAMIC ORGANIZATION CHART REQUALIFIED ON CURRENT PRODUCTION BASELINE — PENDING INTEGRATION**. No Production deployment authorized.

## Commit lineage and preservation

- OLD BASE: a116181dbe7cc437c78772a634ab2a60130cc8e3.
- NEW BASE: 1ddd0f6337c5353dd189087c91af62f30bdf5ffd.
- ORIGINAL FEATURE COMMIT: 3be9a7b7359b98aa1436fed8858e98d88f453b35.
- Fresh integration branch: codex/bs-dynamic-organization-chart-rebased.
- Cherry-picked feature: d616a3062681b9158cb52a8a9d82b5bcb0465d62.
- CONFLICTS: NONE. Fresh worktree was clean at the exact new base before cherry-pick. Original feature worktree remains clean and preserved.
- Removed only the old worktree's meaningless newline-only Sales Coordinator migration status change before creating the original commit. No migration semantics changed.
- PRODUCTION MODIFIED: NO. production-readiness was not checked out or edited; nothing pushed or deployed.

origin/production-readiness, the live /api/version and Vercel Production all verified the new SHA and deployment dpl_8c8yMuxBcQzSYUcUpCVz8Fnycmoj. This candidate contains the whole new baseline plus the organization feature; it is not the old application deployed over Production.

## Production features preserved

MOM upload/API/explicit grants, Official Documents policies, conversion payment and invoice linkage, Revenue/Collections calculations, Sales Coordinator/self-service, patient_care_access, uploaded_by protection, CRM DEFAULT NULL signatures, Teams, gender normalization, profile-photo refresh and Punch-In/Punch-Out source/migrations are retained from the new base. Protected-file diff audit found no modifications to those implementations. Full tests include their regressions.

permission-catalogue.ts changes only by adding organization_chart.manage. It removes no permission. documents.mom.upload was already managed by the released explicit-access migration rather than that static catalogue; that migration and its direct-grant logic are unchanged. Finance and Sales permission entries remain intact.

The only new-baseline adaptations after cherry-pick are test qualification and this report: the workforce assertion now follows the organization_directory RPC to its server-side visibility predicate, and executable employee-creation tests validate canonical IDs and pre-invitation rejection. No new application behavior was added during integration.

## Current Production hierarchy (read-only SQL)

| Record | Profile ID | Account | Actual designation | Actual manager |
| --- | --- | --- | --- | --- |
| Chairman | f7a200b4-2109-41fb-afb7-26ffcb405e76 | bsmilechairman@gmail.com | Chairman | None |
| MD | None | None | No active MD / Managing Director | Not applicable |
| Director | 3f70fd80-bd37-4e89-b014-761bf563a219 | bsmiledirectory@gmail.com | Director | None |
| GM | e64c5750-b585-4cab-9478-2c1fbad3b26e | bsmile.gm@gmail.com | General Manager | None |
| Assistant Manager | No matching designation | Diya's account is diyaassistantmanager@gmail.com | Diya Anthikat is stored as Admin with trailing space, not Assistant Manager | GM |
| Sales Coordinator | 04f7ade2-99ee-43d1-b4c0-de2cd168fc39 | salesheadbsmile@gmail.com | Sales Coordinator (Fatima) | GM |

There are seven active records. Aiswarya P (Psychologist) and Anshad Haneefa (Marketing Cordinator) also report to GM. The owner confirmed keeping Mr. Yousaf as Director. The chart reflects actual null leadership manager IDs until a separately authorized data update establishes Chairman -> Director -> GM. No MD, renamed person or inferred manager is introduced. Chairman sorts first among actual roots.

## Migration compatibility and effective state

MIGRATION: 20260923185924_dynamic_organization_chart.sql. PRODUCTION MIGRATION: NOT APPLIED. QA project: enylrvmjgbntkrgpqsfe. No duplicate application or ledger entry was made on resume.

QA function body fingerprints (MD5 after whitespace removal) match the Git migration:

| Function | Fingerprint |
| --- | --- |
| organization_directory | e0a378cb68dd74849d69568407b8cfb6 |
| prevent_reporting_cycle | 1efc9195b5ea1a09e713890f2b5e8504 |
| update_organization_employee | 8818f7815015c255d48866405c246025 |
| create_employee_department | 41ddf828111177bf324bf59e93ab0a1e |

QA also matches the function signatures, pinned search paths, ACLs, trigger definition, both policy expressions, permission assignments to chairman/director/super_admin, and both department seeds. No PUBLIC/anon execution on organization endpoints; no direct authenticated execution on the trigger. Custom-department RPC remains SECURITY INVOKER.

Production does not yet contain the three new organization RPCs. Its existing cycle function is the prior implementation. has_permission, profile_role_is_protected, official_mom_upload_allowed, patient_care_access and crm_lead_can_view match QA; crm_lead_can_view retains clinical_client uuid DEFAULT NULL. New MOM/payment migrations do not replace organization dependencies. The payment body initially had a different hash because QA omits two comments: removing those comments gives e1a5fc31837a4eb436a87146cd34623b, exactly QA's hash; executable SQL agrees. Production's full body matches Git (c4228211124b621e498ac6bb337e3fe6).

A disposable local PostgreSQL/PGlite harness applied the organization SQL twice: existing employee rows unchanged, existing permission grants retained, exactly two new departments, no duplicate policy/trigger and anonymous execution denied. No destructive employee rewrite or permission deletion exists. The only replaced function is the existing reporting-cycle validator, now checking the full graph with a transaction lock.

Supabase Advisor Center warnings for the intentionally exposed authenticated SECURITY DEFINER projection/mutation were reviewed during initial QA qualification; explicit auth/permission/target guards remain verified. This is not a claim that all existing project-wide advisors are clean.

## Behavior and browser checks

Dynamic chart, canonical employee fields, current private signed photos, initials fallback, Director edit and department persistence: PASS. Real hierarchy and Chairman fixture top-level: PASS. Self-manager/cycles/inactive manager: BLOCKED. Inactive employees: EXCLUDED. Staff/Sales mutations: BLOCKED. Admin/GM ordinary employee edits: PASS.

1366x768 and 390x844, Standard and Colorful: PASS. Connectors follow actual hierarchy, siblings do not overlap, long cards grow vertically, body has no horizontal overflow. The chart pans within its own container; edge cards can be brought fully into view. Root starts centered on narrow screens. Native department select supports keyboard use and fits both create/edit forms.

Browser Director edits saved title, manager, Marketing, a disposable custom department and Business Development through both chart and employee edit forms. Photo upload appeared in profile/header/chart, persisted after mobile reload, and removal restored initials everywhere. No separate avatar storage was added. Existing signed-photo helper and profile refresh behavior are retained. Other sessions update on focus or within the 60-second refresh interval; this is polling, not Realtime.

Employee creation action tests mock the invitation boundary: success persists lookup/manager IDs, invalid department and inactive manager are rejected before invitation, missing create permission is denied. The create form itself was checked in both themes/sizes. No invitation emails were sent. Existing department rows were preserved; custom departments are real lookup rows, not literal Other.

## Validation

- Frozen-lockfile dependencies installed in this worktree; package/lock files unchanged.
- Focused hierarchy/security/MOM/payment/Sales/profile suite: 80 tests in 8 files PASS, plus 4 new employee-creation cases in the final full run.
- Authenticated QA security: 10/10 groups PASS, including anonymous/staff/Sales denial and private-photo replacement/removal access.
- Local executable migration idempotency/additivity test: PASS.
- Full Vitest: **960/960 PASS across 209 files**, rerun on the integrated candidate, including the four new creation-action tests.
- Typecheck: PASS, including added creation tests.
- ESLint: 0 errors, 26 existing repository warnings; added tests lint clean.
- Production build: PASS, 90 pages; run on the current baseline with frozen dependencies.
- Browser runtime errors observed: none.
- Ordinary employee and Sales Coordinator browser profiles each displayed 184 active QA cards and **zero organization edit buttons**; both signed out successfully.
- QA FIXTURES CLEANED: **YES**. Only this run's eight auth/profile fixtures, test photos, custom departments and associated fixture logs were removed. Queries verified zero fixture profile IDs and custom department IDs remain, hence zero active disposable org-chart fixtures. Unrelated QA records were preserved. Temporary app/Production-inspection tabs closed, viewport reset and local server stopped.

Local ignored evidence is under release-evidence (test JSON/logs, security results and migration harness). No credentials are committed. Final branch HEAD is the integrated delivery SHA; original feature commit above remains independently recoverable.
