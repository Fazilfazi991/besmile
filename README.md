# BSmile CRM

BSmile CRM is a Next.js and Supabase internal CRM covering employee operations,
CRM, Finance, payroll, role-based access, and audit-ready workflows.

## Local development

1. Copy `.env.example` to `.env.local` and add development Supabase values.
2. Enable the pinned package manager with `corepack enable`.
3. Install dependencies with `pnpm install --frozen-lockfile`.
4. Run `pnpm run dev`.

Validate changes with:

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

## Deployment

Use the production procedures in [`docs/production-deployment-checklist.md`](docs/production-deployment-checklist.md). Never commit real environment files or run QA seed scripts against Production.
