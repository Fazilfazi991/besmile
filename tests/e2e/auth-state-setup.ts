import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const roles = ['admin', 'general_manager', 'director', 'manager', 'employee', 'assistant_manager', 'psychologist'] as const;

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
        await page.goto('/sign-in');
        await page.getByLabel('Email').fill(email);
        await page.getByLabel('Password').fill(password);
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.waitForURL(/\/(?:admin|employee|clinician)(?:\/|$)/, { timeout: 30_000 });
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
