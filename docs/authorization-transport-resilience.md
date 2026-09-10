# Authorization transport resilience

This change does not alter roles, permission assignments, RLS, D1, D2 or archive rules.

## Runtime behavior

- Verified permission false: existing `/unauthorized` path.
- Missing/invalid session: existing sign-in path.
- Profile/permission/auth transport reset, connection timeout, or upstream 502/503/504: at most one retry after 150 ms, with a 5-second per-attempt deadline. Read queries accept the abort signal. Auth SDK requests without an abort API remain bounded from the caller's perspective; their late result cannot authorize access.
- Still unavailable or malformed response: no protected content. Middleware responds 503, no-store, with a safe message. Server layouts use `/access-unavailable`. Recovery requires an explicit user click; no navigation retry loop.
- Database/RLS/API validation errors are not retried. Missing `granted_permissions` RPC (`PGRST202`) retains the existing legacy permission-read fallback only; transport errors cannot trigger that fallback.
- Middleware profile failures previously fell through to `NextResponse.next()`; that fail-open path is removed.
- No cached permission success is substituted for a failed check.

## QA gate

After the production build and before DB/browser validation, a real QA-only preflight checks all four fixture auth endpoints, their own profile, and the canonical permission RPC. It validates `enylrvmjgbntkrgpqsfe` before making requests. Transient preflight failure yields `RELEASE GATE INFRASTRUCTURE BLOCKED`, nonzero exit, and no browser PASS. Invalid credentials/configuration stay FAIL. The preflight does not grant permissions or provision accounts.

Fixture login permits one transport-only retry with the same credentials; occurrences are recorded in `release-evidence/fixture-login-retries.jsonl` and the final report. Neither mutation operations nor failed functional assertions are retried. A later functional failure remains FAIL even if preflight passed. A PASS requires zero skipped, unexpected or flaky browser cases.

Unit tests invoke actual middleware with controlled Supabase responses to force success-after-reset, repeated resets, denied permissions, invalid sessions, profile failures and RLS errors. Normal real-QA flows remain required. No test fault-injection endpoint is deployed.

## Known evidence limit

The prior Employee Daily Work redirect was intermittent. QA transport ECONNRESET was directly observed, and the old middleware converted errored permission results to denial. The old trace alone cannot prove which particular lookup failed. This patch fixes the independently reproducible failure-handling defect, without claiming reconstruction of that historical event.
