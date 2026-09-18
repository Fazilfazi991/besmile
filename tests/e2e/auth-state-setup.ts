import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { login, type QaRole } from './helpers';

const roles: QaRole[] = ['admin', 'general_manager', 'director', 'manager', 'employee', 'assistant_manager', 'psychologist'];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL || process.env.BSMILE_QA_BASE_URL;
  if (!baseURL) throw new Error('BSMILE_QA_BASE_URL is required for auth-state setup');
  const output = join(process.cwd(), 'release-evidence', 'auth-state');
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of roles) {
      const email = process.env[`BSMILE_QA_${role.toUpperCase()}_EMAIL`];
      const password = process.env[`BSMILE_QA_${role.toUpperCase()}_PASSWORD`];
      if (!email || !password) continue;
      const context = await browser.newContext({ baseURL });
      try {
        const page = await context.newPage();
        // Keep the setup flow identical to the browser suite's proven login
        // path. This also handles a valid pre-existing state without another
        // password submission.
        // Reuse a still-valid matching role state; an expired state falls back
        // to the canonical password-login flow and is replaced below.
        await login(page, role);
        await context.storageState({ path: join(output, `${role}.json`) });
        writeFileSync(join(output, `${role}.meta.json`), JSON.stringify({ email }));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
