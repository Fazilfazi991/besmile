import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseURL = process.env.BSMILE_QA_BASE_URL;
const email = process.env.BSMILE_QA_EMPLOYEE_EMAIL;
const password = process.env.BSMILE_QA_EMPLOYEE_PASSWORD;
if (!baseURL || !email || !password) throw new Error('QA URL and Employee credentials are required');
const browser = await chromium.launch();
const output = join(process.cwd(), 'qa-artifacts', 'client-followup-screenshots');
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await page.goto('/sign-in', { timeout: 90000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(admin|employee)(?:\/|$)/, { timeout: 90000 });
  await page.goto('/employee/profile');
  await page.getByRole('heading', { name: 'Personal information' }).waitFor({ timeout: 30000 });
  await page.getByText('Loading organization…').waitFor({ state: 'hidden', timeout: 30000 });
  const text = await page.locator('body').innerText();
  if (!text.includes('Official ID') || text.includes('Employee ID')) throw new Error('Non-executive ID label is incorrect');
  if (text.includes('.local')) throw new Error('Placeholder login email is displayed as contact information');
  await page.screenshot({ path: join(output, 'desktop-standard-nonexecutive-profile.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'colorful'; localStorage.setItem('bsmile-theme-mode', 'colorful'); });
  await page.screenshot({ path: join(output, 'mobile-colorful-nonexecutive-profile.png'), fullPage: true });
  writeFileSync(join(output, 'nonexecutive-profile-verification.json'), JSON.stringify({ officialIdLabel: true, employeeIdLabelAbsent: true, placeholderEmailAbsent: true }, null, 2));
  await context.close();
} finally { await browser.close(); }
