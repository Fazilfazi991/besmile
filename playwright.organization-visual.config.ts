import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['organization-chart-visual.e2e.ts', 'organization-chart-qa-smoke.e2e.ts'],
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3100', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
});
