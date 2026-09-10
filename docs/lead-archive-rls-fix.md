# Lead archive RLS fix — QA qualification

Base: `42be2d6373d5d12b201f47e866061078f1796939`.
Local branch: `codex/fix-lead-archive-returning`.
QA project: `enylrvmjgbntkrgpqsfe`. No Production migration or deployment authorized here.

## Root cause and reproduction

The canonical archive changes only `crm_leads.archived_at`. The scoped SELECT
policy requires `archived_at IS NULL`; UPDATE uses `crm_lead_can_view(assigned_to)`
and the existing trigger enforces `leads.edit` / `crm.manage_all`.
The PostgREST mutation requests the updated row, which no longer satisfies SELECT
RLS. A disposable QA lead reproduced SQLSTATE `42501` with the original request,
with a minimal-response/count request, and with an ordinary invoker UPDATE RPC.
Admin and General Manager fixtures both had the canonical edit/manage permissions.
This is not a missing table privilege or a reason to expose archived leads.

## Fix

`20260910080305_archive_crm_lead_without_returning.sql` adds
`archive_crm_lead(uuid)`, a SECURITY INVOKER function. It selects and locks exactly
one live row with FOR UPDATE, then performs a positioned UPDATE WHERE CURRENT OF.
The initial read obeys SELECT and UPDATE RLS; the positioned mutation still obeys
UPDATE policies and all existing triggers. It does not require SELECT access to
the new archived row. ROW_COUNT must be one before a receipt is returned.

No policies, table grants, roles, auth, historical records or visibility helpers
are changed. PUBLIC/anon cannot execute the RPC. No SECURITY DEFINER or service
role is used. Unknown, inaccessible and already archived IDs fail without an
existence-revealing distinction. The repository validates the receipt's ID and
timestamp presence. UI failures use the existing sanitized error/logging layer.

## Verification completed

- QA RPC installed and exercised with real authenticated clients.
- 28 focused database/API assertions passed (Admin and GM archive, employee and
  anonymous denial, no changes after denied attempts, archived direct-ID hidden,
  repeat/missing-ID failure).
- Physical retention is guarded through duplicate-key checks using ordinary QA
  callers (failed inserts roll back), plus a read-only owner audit confirmed two
  archived fixture rows and their two original follow-ups remain stored.
- Live QA audit confirmed invoker execution, no PUBLIC/anon EXECUTE, authenticated
  EXECUTE, enabled RLS, unchanged UPDATE policies and an enabled permission trigger.
- Permanent Admin/GM browser archive cases run at both gate viewports, including
  controlled error normalization, list population decrement and dashboard loading.
- All 27 QA security probes passed, including the new archive regression group.
- 721 unit/integration tests passed; TypeScript passed.
- Production build passed (86 pages generated; existing lint warnings only).
- Scoped ESLint: no errors, one pre-existing useEffect dependency warning.
- Diff whitespace check passed.
- Disposable QA leads are soft-archived through the new RPC and retained as QA
  evidence; no Production lead was used as a test fixture.

Initial QA reproduction fixture: `5c5fb807-1fe4-474b-9f9d-a409ccc3095d`.
First dedicated probe fixtures: `1cedac5b-5dbc-4bd1-8e79-2ac5097af680` and
`9e6588f1-2202-4e6f-8f2d-b37ac0c26413`. All successfully archived in QA.

## Outstanding release gates

This document is not Production approval. The full clean-install release gate and
authenticated browser lifecycle on a Preview of the final committed candidate
must still run. No push or Preview deployment has been performed in this task.
The Production three-lead cleanup remains blocked until separately approved
deployment/migration and fresh dependency checks.

References: PostgreSQL CREATE POLICY (SELECT checks on UPDATE/RETURNING) and
PL/pgSQL Cursors (FOR UPDATE / WHERE CURRENT OF).
