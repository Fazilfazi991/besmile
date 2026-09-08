import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BSMILE_QA_BASE_URL;
if (!baseURL && process.env.CI) throw new Error('BSMILE_QA_BASE_URL is required');

export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.e2e.ts', timeout: 45_000, expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'release-evidence/playwright-results.json' }]],
  use: { baseURL: baseURL || 'http://127.0.0.1:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'mobile-390', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
  ],
});
