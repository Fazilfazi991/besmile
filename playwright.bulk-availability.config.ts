import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'bulk-availability.e2e.ts',
  timeout: 180_000, expect: { timeout: 30_000 }, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'release-evidence/bulk-availability/browser-results.json' }]],
  use: { baseURL: 'http://localhost:3035', screenshot: 'only-on-failure' },
});
