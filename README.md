# BSmile CRM

BSmile CRM is a Next.js and Supabase internal CRM covering employee operations,
CRM, Finance, payroll, role-based access, and audit-ready workflows.

## Local development

1. Copy `.env.example` to `.env.local` and add development Supabase values.
2. Install dependencies with `npm ci`.
3. Run `npm run dev`.

Validate changes with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Deployment

Use the production procedures in [`docs/production-deployment-checklist.md`](docs/production-deployment-checklist.md). Never commit real environment files or run QA seed scripts against Production.
