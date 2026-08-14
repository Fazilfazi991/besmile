# Batch 3 — Psychologist Payment Statements

## Scope

This branch adds official pending and paid psychologist payment statements. It does not change Batch 2's payable migration or settlement function and has not been deployed.

## Batch 2 reconciliation after production PASS

- Recheck the Batch 2 status vocabulary and payable columns used by `20260814054449_psychologist_payment_statements.sql` after Laptop 2's final fixes.
- Confirm `payment_due`, `scheduled`, and `on_hold` remain the eligible pending states, and `paid_at` plus `payment_reference` remain the settlement metadata.
- The existing Batch 2 screen renders **Mark paid** for every `payment_due` row after checking only view access in the client. The Batch 2 RPC still enforces `psychologist_payments.settle` and `finance.manage`, so direct settlement remains server-blocked. This branch deliberately does not change that Batch 2-owned behavior.
- Re-run the full suite after rebasing/merging the final Batch 2 PASS commit into this feature branch.

## Deployment

**NOT DEPLOYED — WAITING FOR BATCH 2 PRODUCTION PASS**
