# Employee directory and authorization hotfix

Qualification: 7 October 2026. Baseline: 1887c2a146b39479be1462f7fe9ea3c2aaa1e7e3 on production-readiness.

## Problem and change

The All and Removed employee views included previously reviewed QA profiles because the archived rows remain employees for audit history. All shared employee directory queries now exclude the exact 14 fixture IDs from the existing production cleanup migration before counting, pagination, and search. Real former employees and ambiguous historical records remain available.

Production logs also showed repeated middleware session/profile timeouts during concurrent background navigation prefetch. Protected navigation and directory profile links no longer prefetch. Middleware uses one request-scoped live permission batch, cancels timed-out Auth fetches before retrying, and runs in Tokyo alongside the existing Production Supabase database. Server functions also run in Tokyo.

No database migration, account reset, permission grant, availability edit, or clinical-data mutation is included. Live getUser session validation, onboarding redirects, role gates, revocation freshness and fail-closed denial remain enforced.

## Validation

- Frozen dependency installation, typecheck and Production build passed. Middleware build manifest confirms hnd1.
- Lint: zero errors; 25 existing warnings.
- Full suite: 1,384 passed, seven documented baseline failures, no new failed tests.
- Tests cover directory filtering before counts/pagination, preservation of real staff, request-local grants, revocation, malformed grants, onboarding, denial and actual fetch cancellation. Marketing department route coverage now mocks the production permission batch.

Baseline failures: branding-asset, conversion-client-semantics, dashboard-kpi-visual-contract, employee-removal-management, module-icon-audit, operational-workforce-visibility, staff-attendance-access.

## Release verification

Production deployment, authenticated browser smoke and post-release data invariant comparison are recorded in ignored release-evidence/staff-access artifacts. The pre-release inventory confirmed all 14 fixture profiles were already inactive, login-disabled, workforce-hidden and removed.
