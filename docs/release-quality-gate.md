# BSmile release quality gate

The pre-release gate targets only the isolated QA project. Copy `.env.release-gate.example` into the secure CI secret store; never commit values.

1. Install Chromium once with `npx playwright install chromium`.
2. Export every required `BSMILE_QA_*` variable.
3. Run `npm run release:check`.
4. Attach `release-evidence/release-gate-report.json` and Playwright traces to the release.

Missing credentials, a database probe failure, or any critical browser failure produces `RELEASE GATE FAIL`. Production smoke is separate: set the production base URL and dedicated smoke credentials, explicitly set `BSMILE_PRODUCTION_SMOKE=1`, then run `npm run smoke:production`. It performs navigation-only checks and must never use client records.

No paid monitoring provider is configured. Runtime failures use sanitized structured console events suitable for Vercel logs. A future monitoring integration should consume the same metadata contract without recording payloads or private content.
