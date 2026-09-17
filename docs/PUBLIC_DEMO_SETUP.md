# Public portfolio demo

The public demo is entirely local and does not connect to Supabase. It uses the real Besmile Director application shell, canonical navigation, Director dashboard components, and selected production UI components with fictional TypeScript data in `src/demo/`.

## Run locally

Copy `.env.demo.example` to `.env.local` and run `pnpm dev`. The only required settings are:

```env
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Do not add Supabase credentials. In demo mode, middleware, the Director demo shell, and portfolio routes bypass authentication and database initialization. The one-click **Enter Demo** button navigates directly to `/admin`, the real Director landing route, without a password or external service.

## Demo content

All people, client records, schedule entries, notes, notifications, and metrics are fictional. Local interactions such as completing a task, marking a notification read, and saving a note update React state only and reset on refresh.

Unsupported or sensitive actions remain unavailable: file upload/download, exports, report/PDF generation, invitations, password/account changes, external feedback, push delivery, webhooks, integrations, and destructive actions. These server endpoints retain the public-demo guard and return: `This action is disabled in the public demo.`

## Deployment

Deploy the `feature/public-demo` branch to the existing `besmile-public-demo` Vercel project. Configure only `NEXT_PUBLIC_DEMO_MODE=true` (and optionally the public app URL). Do not attach production environment variables, a Supabase project, external-service credentials, or cron/webhook secrets. Production mode remains unchanged whenever `NEXT_PUBLIC_DEMO_MODE` is false.
