# Dynamic organization chart — original feature audit

Original base: a116181dbe7cc437c78772a634ab2a60130cc8e3.
Branch: codex/bs-dynamic-organization-chart.
Status: implementation complete on original baseline; NOT a release candidate. Requalification on 1ddd0f6337c5353dd189087c91af62f30bdf5ffd is required.

## Findings and implementation

The old chart used seven static names, portrait paths and reporting links. It now reads actual active profiles through organization_directory(), uses profile IDs, profiles.manager_id, profiles.designation and departments lookup IDs. Missing managers and legacy cycles are explicit unassigned roots. No reporting relationships are invented.

Production read-only audit found Chairman, Mr. Yousaf (Director), Mr. Muhammad Faiz AU (General Manager), Fatima (Sales Coordinator), Diya Anthikat (Admin), Aiswarya P (Psychologist), and Anshad Haneefa (Marketing Cordinator). No actual MD or Assistant Manager exists in those records. The owner explicitly confirmed keeping Mr. Yousaf as Director. Chairman, Director and GM currently have null manager IDs; other listed employees report to GM. Intended Chairman -> Director -> GM links require a separate authorized data update after integration. This migration does not rewrite those records.

The shared chart displays current signed private profile photos with initials on removal/failure. It refreshes after local edits, on focus and every 60 seconds while visible. Existing profile upload/remove router refresh is preserved. Authorized editing accepts only manager, designation and department; authorization roles are independent. Database guards reject self/circular relationships, inactive managers and Chairman subordination. Native department selects support Business Development, Marketing and custom lookup creation, with literal Other rejected. One scroll-contained tree works in both themes and viewport sizes.

## Migration/security

20260923185924_dynamic_organization_chart.sql was explicitly approved and applied ONLY to Bsmile QA Tokyo (enylrvmjgbntkrgpqsfe), in a transaction through the authenticated SQL dashboard. It was not added to migration history. Do not duplicate-apply merely to create a ledger entry.

The migration adds two departments, a narrow organization_chart.manage permission, an authenticated organization-field projection, current-avatar Storage SELECT policy, custom department INSERT/RPC and hierarchy validation. Public/anonymous RPC execution is revoked. It changes no authorization role, login, HR or finance data. Existing auditing is preserved.

Supabase Advisor Center flags authenticated SECURITY DEFINER access to the directory and organization mutation. This access is intentional and limited by explicit auth/permission guards, field projection and protected-target checks. Anonymous and unauthorized mutation tests passed. Other existing advisor findings were not modified.

## Original-baseline verification

- Focused tests: 28/28 PASS.
- Authenticated QA security probes: 10/10 groups PASS (director/admin/GM allow, staff/sales/anonymous deny, real hierarchy, self/cycle/Chairman/inactive guard, departments and private-photo lifecycle).
- Full Vitest: 882/882 PASS across 204 files, maxWorkers=2. Existing CRLF-sensitive tests required local newline normalization; no unrelated migration semantics changed. A concurrent PDF timeout passed on full rerun.
- Typecheck and production build: PASS (89 pages).
- ESLint: zero errors, 26 repository warnings.
- Authenticated browser: Director edits persisted, custom department persisted, uploaded/removed photo synchronized across profile/header/chart; ordinary employee saw no chart edit buttons.
- 1366x768 and 390x844, Standard and Colorful: PASS. Long name/title fit, no body overflow, readable local panning, first root centered on mobile. Employee-create department keyboard selection and layout passed. No real employee invitation sent.
- Eight disposable QA accounts/profiles, custom departments, test photos and associated fixture logs cleaned; zero fixture profile/department IDs remained. Existing unrelated QA data preserved.

These results apply ONLY to the original baseline. Production and production-readiness were not modified. Feature files are limited to organization chart/config/repository, employee profile/create/edit integration, department select, permission catalogue, focused tests, QA script, migration and this report. Finance, CRM, Teams, MOM and shared global styles remain untouched. Preserve this branch as recovery evidence while qualifying the fresh integration worktree.
