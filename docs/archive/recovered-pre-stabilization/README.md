# Recovered pre-stabilization material

This directory preserves selected material recovered from the historical mixed BSmile worktree. It is review-only evidence based on Production commit `8bea3c42f2a13dd08087fbe6da28bfc1689737d8`.

Do not merge this directory or its contents into Production automatically. The SQL files are not part of the active migration chain and must not be applied without explicit product, security, and database review. The scripts are not approved for execution merely because they are archived here.

## Preserved items

| Original material | Archive location | Type | Reason | Future review status |
|---|---|---|---|---|
| Six tracked dirty files | `patches/tracked-unique-hunks.patch` | Source/test patch | Preserves only diffs against current Production: workforce-view filtering, calendar confirmation/error handling, push timeouts/configuration handling, idea edit-state protection, cleanup replay tests, and payable lifecycle tests | Potentially useful; explicit approval required before selective application |
| Two meeting-host SQL files | `migrations/` | Migration review material | Unique assistant-manager meeting-host permission design absent from Production | Must not be applied or added to the active chain without explicit approval |
| Twelve contract/replay tests | `tests/` | Test review material | Unique assertions absent from current Git refs | Review individually; paths and imports reflect the old tree |
| `layout-stability.css` | `source/` | Source review material | Unique stylesheet paired with the archived layout contract test | Historical/incomplete; do not copy blindly |
| Two staging QA scripts | `scripts/` | Script review material | Both validate an expected staging project and reject production runtimes | Destructive staging operations remain possible; inspect before every run |
| Navigation verification report and production-apply record | `evidence/` | Evidence/documentation | Small textual evidence with ongoing forensic value | Reference only; not application source |

## Tracked hunk decisions

- `src/app/admin/employees/page.tsx`: preserve the unique active/former workforce filtering hunk.
- `src/lib/production-user-cleanup.test.ts`: preserve the unique missing-identity and guarded-grant replay assertions.
- `src/lib/staff-managed-outsourced-psychologist.test.ts`: preserve the unique completed-appointment payable lifecycle assertion.
- `src/app/employee/calendar/page.tsx`: preserve the confirmation dialog and safer user-facing error handling as review material.
- `src/components/browser-push-settings.tsx`: preserve timeout, VAPID validation, and more specific failure handling.
- `src/components/idea-hub.tsx`: preserve double-submit protection, edit feedback, and explicit back navigation.

The full dirty files were deliberately not copied over Production.

## Explicit exclusions

- `20260815090000_task_sla_health.sql`, persisted SLA metadata, and the superseded Task Management implementation.
- Files already equivalent to Production, including migrations whose only difference was a trailing blank line or formatting.
- `.next*`, node/Vite caches, and temporary build output.
- `supabase/production-schema-prebridge-20260814.json`: large historical schema snapshot; excluded from Git history.
- `docs/qa-evidence/*.pdf`: generated binary evidence; excluded from Git history.
- The following QA scripts were excluded because they target Production, use privileged credentials, depend on named live accounts, or perform unguarded mutations:
  - `qa-communications-lifecycle.mjs`
  - `qa-crm-lifecycle.mjs`
  - `qa-document-lifecycle.mjs`
  - `qa-inspect-communications.mjs`
  - `qa-inspect-permissions.mjs`
  - `qa-invoice-lifecycle.mjs`
  - `qa-leave-lifecycle.mjs`
  - `qa-live-performance.mjs`
  - `qa-live-regression.mjs`
  - `qa-print-invoice.mjs`
  - `qa-report-exports.mjs`
  - `qa-responsive-performance.mjs`
  - `qa-scheduling-calendar-lifecycle.mjs`

Their existence and exclusion are documented here so the original worktree can be cleaned without treating them as approved reusable tooling.

## Safety

Nothing in this archive has been deployed, executed against a database, or incorporated into Production. Future recovery should select individual hunks or assertions and review them against the then-current source.
