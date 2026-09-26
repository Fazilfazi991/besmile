import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseURL = process.env.BSMILE_QA_BASE_URL;
const email = process.env.BSMILE_QA_DIRECTOR_EMAIL;
const password = process.env.BSMILE_QA_DIRECTOR_PASSWORD;
if (!baseURL || !email || !password) throw new Error('QA URL and Director credentials are required');
const output = join(process.cwd(), 'qa-artifacts', 'client-followup-screenshots');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await page.goto('/sign-in', { timeout: 90000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  try { await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 90000, waitUntil: 'commit' }); }
  catch (error) {
    await page.screenshot({ path: join(output, 'login-failure.png') });
    throw new Error(`QA login failed at ${page.url()}: ${await page.locator('[role="alert"]').allTextContents()}`, { cause: error });
  }
  await page.locator('.app-shell').waitFor();
  for (const [label, width, height] of [['desktop', 1366, 900], ['tablet', 820, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/admin');
    await page.locator('.director-dashboard').waitFor({ timeout: 30000 });
    await page.locator('[aria-busy="true"]').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    for (const theme of ['standard', 'colorful']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem('bsmile-theme-mode', value); }, theme);
      const path = join(output, `${label}-${theme}-dashboard.png`);
      await page.screenshot({ path, fullPage: true });
      const chart = page.locator('.director-trend-panel');
      const dashboard = page.locator('.director-layout');
      const chartBox = await chart.boundingBox();
      const layoutBox = await dashboard.boundingBox();
      const legendWidths = await page.locator('.director-chart-key i').evaluateAll(items => items.map(item => item.getBoundingClientRect().width));
      if (chartBox && layoutBox && chartBox.width / layoutBox.width < .95) throw new Error(`Trend panel does not fill row at ${label} ${theme}`);
      if (legendWidths.some(width => width > 12)) throw new Error(`Oversized legend marker at ${label} ${theme}`);
      results.push({ label, theme, chartToRowWidth: chartBox && layoutBox ? chartBox.width / layoutBox.width : null, chartGridColumn: await chart.evaluate(node => getComputedStyle(node).gridColumn), kpiColumns: await page.locator('.director-kpis').evaluate(node => getComputedStyle(node).gridTemplateColumns), legendWidths, bodyOverflow: await page.evaluate(() => document.body.scrollWidth > innerWidth + 2) });
    }
  }
  const longEmail = 'long.personal.email.address.for.layout.qa@example.test';
  await page.route('**/rest/v1/profiles?*', async route => {
    const select = new URL(route.request().url()).searchParams.get('select') || '';
    if (!select.startsWith('*,department:')) return route.continue();
    const response = await route.fetch();
    const profile = await response.json();
    await route.fulfill({ response, body: JSON.stringify({ ...profile, personal_email: longEmail, date_of_birth: '2000-01-28' }) });
  });
  for (const [label, width, height] of [['desktop', 1366, 900], ['tablet', 820, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/admin/profile');
    await page.getByRole('heading', { name: 'Personal information' }).waitFor({ timeout: 30000 });
    await page.getByText(longEmail, { exact: true }).waitFor({ timeout: 30000 });
    const completion = await page.locator('.profile-completion-banner').textContent().catch(() => '');
    if (completion?.includes('Employee ID') || completion?.includes('Official ID')) throw new Error('Executive profile still requires an ID');
    const emailBox = await page.getByText(longEmail, { exact: true }).boundingBox();
    const birthBox = await page.getByText('2000-01-28', { exact: true }).boundingBox();
    if (emailBox && birthBox && emailBox.y < birthBox.y + birthBox.height && birthBox.y < emailBox.y + emailBox.height && emailBox.x + emailBox.width > birthBox.x + 2) throw new Error(`Personal email overlaps date of birth at ${label}`);
    for (const theme of ['standard', 'colorful']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem('bsmile-theme-mode', value); }, theme);
      await page.screenshot({ path: join(output, `${label}-${theme}-profile-long-email.png`), fullPage: true });
    }
    await page.goto('/admin/crm/leads');
    await page.getByRole('button', { name: 'Add lead' }).click();
    for (const theme of ['standard', 'colorful']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; localStorage.setItem('bsmile-theme-mode', value); }, theme);
      await page.getByRole('dialog', { name: 'Add lead' }).screenshot({ path: join(output, `${label}-${theme}-lead-category.png`) });
    }
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await page.locator('.app-sidebar.sidebar-collapsed').screenshot({ path: join(output, 'desktop-collapsed-sidebar-logo.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'All Modules' }).click();
  await page.getByRole('dialog', { name: 'Mobile navigation' }).screenshot({ path: join(output, 'mobile-navigation-logo.png') });
  writeFileSync(join(output, 'measurements.json'), JSON.stringify(results, null, 2));
  await context.close();
} finally { await browser.close(); }
