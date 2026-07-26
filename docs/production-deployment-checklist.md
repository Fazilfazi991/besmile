# BSmile CRM production deployment checklist

This checklist deliberately does not deploy the application. Complete each item, record the operator and timestamp, and retain the database backup reference before making the production project live.

## 1. Environment and build

- [ ] Copy `.env.example` to the deployment provider's environment-variable settings; never commit a real `.env.local` file.
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL` for Production and the intended Preview environments.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` only for server-side scripts/jobs that genuinely need it. It must never be exposed through `NEXT_PUBLIC_`, client components, browser bundles, or logs.
- [ ] Do not set `QA_SEED_PASSWORD`, `SEED_USER_TEMP_PASSWORD`, or `ALLOW_QA_SEED` in Production. QA scripts reject `NODE_ENV=production`, `VERCEL_ENV=production`, or `ALLOW_QA_SEED=false`.
- [ ] Search the production build and source for `localhost`, service-role keys, and debug credentials. Replace hard-coded URLs with `NEXT_PUBLIC_APP_URL` where an absolute URL is needed.
- [ ] Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` using production-like public variables. Do not print secrets in CI output.

Current repository finding: the browser client and middleware use only Supabase URL/anonymous key. The service-role key is used by local operational scripts only. Keep it that way.

## 2. Supabase project verification

- [ ] Create a dedicated production Supabase project; do not promote the QA project by changing its name.
- [ ] Apply migrations sequentially using [migration-checklist.md](migration-checklist.md). Record the database backup ID before the first migration.
- [ ] Verify `profiles`, role/permission tables, attendance, leave, task, document, announcement, notification, chat, CRM, finance, invoice, payroll, audit, and settings tables exist.
- [ ] Verify primary/foreign keys, indexes, triggers, and RLS are enabled on application tables.
- [ ] Confirm the permission catalogue and active finance categories/accounts have been seeded.
- [ ] Confirm `has_permission`, `current_role`, `in_management_tree`, `can_manage_task_assignment`, and finance security-definer functions exist and retain `set search_path=public`.
- [ ] Query `pg_policies` to confirm only the intended scoped task-assignment policies remain after migration `0030`.

### Storage verification

Create the buckets through the migrations, then verify they are **private** unless a documented business need says otherwise:

| Bucket | Intended use | Access expectation |
| --- | --- | --- |
| `profile-photos` | Employee avatars | authenticated owner/authorized viewer; signed URL |
| `employee-documents` | Company and requested documents | recipient/manager scope; signed URL |
| `leave-attachments` | Leave evidence | requester/reviewer scope; signed URL |
| `chat-attachments` | Chat files | conversation-member scope; signed URL |
| `finance-receipts` | Transaction receipts | finance-permitted scope; signed URL |

- [ ] Verify object paths are based on authenticated profile IDs.
- [ ] Verify uploads reject unauthorized users and unacceptable types/sizes.
- [ ] Verify signed URLs expire (current repository helpers use short-lived URLs: 60–300 seconds).
- [ ] Do not use public bucket URLs for private employee, finance, or chat data.

## 3. Super Admin bootstrap

Do not hard-code a real email in a migration. In the Supabase SQL Editor, first create/confirm the Auth user through the dashboard or a secure admin script, then run this template with the real email substituted only at execution time:

```sql
-- Replace the placeholder before execution. It changes one intended account only.
with intended_user as (
  select id, email from auth.users where email = 'REPLACE_WITH_REAL_ADMIN_EMAIL'
)
insert into public.profiles (id, email, full_name, role, status)
select id, email, 'Super Admin', 'super_admin', 'active' from intended_user
on conflict (id) do update
set email = excluded.email, role = 'super_admin', status = 'active';

-- Verify the intended account only.
select id, email, role, status
from public.profiles
where email = 'REPLACE_WITH_REAL_ADMIN_EMAIL';
```

- [ ] Sign in as this user and verify `has_permission('admin.access')` and finance/roles access.
- [ ] Store recovery ownership and MFA/credential recovery instructions in the organisation password vault, not this repository.

## 4. QA and demo data

- [ ] Do not copy `@qa.bsmile.local` accounts or records prefixed `QA-` into Production.
- [ ] In the existing QA project, archive or remove only disposable QA records after preserving audit evidence and backup exports.
- [ ] Keep `scripts/seed-qa-role-users.mjs` and `scripts/qa-final-task-scope.mjs` development-only; their production guard must remain enabled.
- [ ] Demo records must use a `DEMO-` prefix and fictional, non-sensitive data. Never use real employee bank, salary, client, health, identity, or contact data without approval.

### Repeatable demo-data procedure

1. Create a non-production demo project or restore a disposable demo database backup.
2. Create fictional `DEMO-` employees and use their generated profile IDs for all linked records.
3. Seed a small, dated set of attendance, leave, tasks, announcements, one CRM lead/follow-up/sale, finance income/expense, an invoice, and a payroll run.
4. Verify relationships and RLS as the demo employee, then archive the workspace after the demo.
5. Require an explicit `ALLOW_DEMO_SEED=true` guard before introducing any automated demo seeder; never run it against Production.

## 5. Vercel and authentication configuration

- [ ] Import the repository with root directory set to this Next.js project.
- [ ] Framework preset: Next.js. Install command: `npm ci`. Build command: `npm run build`. Node: use the version pinned by the deployment platform or add an approved `.nvmrc` before release.
- [ ] Configure Production environment variables separately from Preview and Development.
- [ ] Set the production custom domain and set `NEXT_PUBLIC_APP_URL` to its HTTPS canonical URL.
- [ ] In Supabase Auth: set Site URL to the canonical production URL; add that URL and only intentional Vercel preview URLs to Redirect URLs. Keep `http://localhost:3000` limited to development.
- [ ] Add password-reset, OTP, and magic-link redirect URLs only where the corresponding authentication flow is enabled.
- [ ] Validate a Preview deployment cannot access Production-only secrets.

## 6. Backup, rollback, and incident response

- [ ] Export/backup database data and record the Supabase backup/PITR reference before migrations.
- [ ] Export critical Storage objects or establish a bucket backup process; database backups do not replace object backups.
- [ ] Treat schema migrations as forward-only unless a tested rollback migration exists. Roll forward with a corrective migration rather than guessing with destructive SQL.
- [ ] Before a finance/payroll migration, export finance transactions, invoices, payments, payroll runs, and audit events.
- [ ] To roll back an app release, promote the previous healthy Vercel deployment. This does not roll back database changes.
- [ ] For a bad RLS policy: restrict affected route access, restore the last known good policy SQL, verify using a least-privilege QA account, then reopen access.
- [ ] Keep two independently recoverable Super Admin accounts and document emergency recovery outside source control.

## 7. Minimal observability

- [ ] Configure Vercel/server error reporting (and optional Sentry) for unhandled server errors.
- [ ] Monitor authentication failures, Supabase query/RLS errors, failed receipt uploads, invoice payment failures, payroll payment failures, and failed background/operational scripts.
- [ ] Do not log passwords, OTPs, cookies, access tokens, bank numbers, private documents, or detailed financial payloads.
- [ ] Retain audit events according to the organisation’s approved retention policy.

## 8. Post-deployment smoke test and rollback triggers

Use [production-smoke-test.md](production-smoke-test.md) immediately after deployment. Roll back the app deployment and/or restrict affected features if authentication, RLS isolation, finance postings, payroll postings, or file authorization fails.
