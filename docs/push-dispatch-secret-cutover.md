# Push dispatch secret cutover

This runbook accompanies the forward migration
`supabase/migrations/20260925093947_rotate_push_dispatch_secret_to_vault.sql`.
It is a staged production operation. Do not execute production steps until the
owner explicitly approves the cutover and names the operator and test recipient.
Never put either credential in Git, a command line, SQL migration text, logs,
or this document.

## Preconditions

- Confirm the production application still uses the existing
  `PUSH_DISPATCH_SECRET` and the existing database trigger still dispatches.
- Confirm the chosen deployment corresponds to the tested dual-secret commit.
- Generate `NEW_PUSH_DISPATCH_SECRET` independently through an approved secret
  manager. The same value must reach the Vercel server environment and Vault
  through secure operator actions. Do not copy it through chat.
- Prepare a controlled notification and a recipient with a valid push
  subscription. Observe only request IDs, response codes, and delivery counts.
- Confirm how to apply this single forward SQL file without replaying any
  unrelated historical migrations. Do not use a broad `db push` against an
  unreconciled migration history.

## Cutover sequence

1. Set the new value as `PUSH_DISPATCH_SECRET_NEXT` in the production Vercel
   server environment while leaving `PUSH_DISPATCH_SECRET` unchanged. Deploy
   the tested dual-secret receiver and confirm the deployment is READY.
2. Verify a controlled dispatch still succeeds through the existing trigger.
   The database is still using `OLD_PUSH_DISPATCH_SECRET` at this point.
3. Store `NEW_PUSH_DISPATCH_SECRET` in production Supabase Vault under the fixed
   name `bsmile_push_dispatch_secret`. Store the existing production receiver
   URL under `bsmile_push_dispatch_url`. Verify names and privileged lookup
   without displaying decrypted values. Confirm `anon` and `authenticated`
   cannot SELECT `vault.decrypted_secrets`.
4. Apply the reviewed migration in one transaction. Verify the enabled
   `AFTER INSERT` trigger calls `private.dispatch_browser_push()`, owned by
   `postgres`, with `SECURITY DEFINER`, `search_path=pg_catalog`, and no
   client-role EXECUTE. Verify function and trigger definitions contain no
   credential literal. Do not change grants on
   `supabase_functions.http_request()`.
5. Create a controlled legitimate notification through the normal workflow.
   Confirm the new request ID in `supabase_functions.hooks`, successful
   `pg_net` response, receiver acceptance, and push delivery. If this fails,
   stop; keep dual-secret acceptance until the new path works. Do not restore
   the old plaintext trigger as a routine rollback.
6. Deploy the prepared single-secret receiver with the new value as the sole
   `PUSH_DISPATCH_SECRET`; remove `PUSH_DISPATCH_SECRET_NEXT` and the old
   environment value from active configuration. Confirm READY and repeat the
   controlled delivery check.
7. Where a safe credential test is available, confirm
   `OLD_PUSH_DISPATCH_SECRET` is rejected and `NEW_PUSH_DISPATCH_SECRET`
   succeeds. Do not record values or headers. Review older reachable Vercel
   deployments before declaring retirement complete.
8. Create a fresh production schema-only dump with the authorized database
   connection. Scan it for both credential values in memory, generic
   credential-shaped strings, data-loading statements, and Auth/business
   rows. The prior redacted incident captures are
   **NOT CANONICAL — CONTAINED/REDACTED INCIDENT ARTIFACT**. Only a clean,
   fresh post-remediation dump can be considered for later baseline work.

## Local qualification

The migration was exercised in a disposable local Supabase PostgreSQL 17
instance using only synthetic Vault values and a local mock receiver.
Neither local SQL nor the local schema dump is a production baseline source.

## Checkpoint refs

The old credential was found in two local Codex checkpoint/capture refs during
the incident audit. The capture ref is no longer present; one checkpoint tree
ref remains locally reachable. No `refs/codex/turn-diffs/*` ref was advertised
by `origin` during this review. Do not rewrite history as part of the
credential cutover. After incident evidence retention is decided, a
separately approved tooling-aware cleanup may delete only the identified
remaining local checkpoint ref and then prune unreachable objects. Recheck
remote reachability before any cleanup.
