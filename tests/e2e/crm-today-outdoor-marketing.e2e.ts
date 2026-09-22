import { expect, test, type Page } from '@playwright/test';
import { crmDashboardPeriodRange, currentCrmBusinessDate, shiftCrmDateKey } from '../../src/lib/crm-dashboard-e1';
import { login, navigateAfterLogin } from './helpers';

async function mockCanonicalTodaySummary(page: Page, periodLeads = 7) {
  await page.route('**/rest/v1/rpc/crm_dashboard_summary', async route => {
    const request = route.request();
    const payload = JSON.parse(request.postData() || '{}') as { period_start?: string; period_end?: string };
    const date = payload.period_start || '2026-09-20';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        periodLeads,
        converted: 0,
        contacted: 0,
        assessment: 0,
        daily: [{ date, leads: periodLeads, converted: 0 }],
        statuses: [{ name: 'New', count: periodLeads }],
        sources: [{ name: 'Outdoor Marketing', count: periodLeads }],
        followups: { due: 0, overdue: 0, upcoming: 0, completed: 0 },
        financeAllowed: true,
        revenue: 0,
        expenses: 0,
      }),
    });
  });
}

async function mockCanonicalPeriodSummary(page: Page) {
  await page.route('**/rest/v1/rpc/crm_dashboard_summary', async route => {
    const payload = JSON.parse(route.request().postData() || '{}') as { period_start?: string; period_end?: string };
    const start = payload.period_start || currentCrmBusinessDate();
    const end = payload.period_end || start;
    const periodLeads = Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
    const converted = Math.min(5, periodLeads);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        periodLeads,
        converted,
        contacted: 0,
        assessment: 0,
        daily: [{ date: start, leads: periodLeads, converted }],
        statuses: [{ name: 'New', count: periodLeads }],
        sources: [{ name: 'Outdoor Marketing', count: periodLeads }],
        followups: { due: 0, overdue: 0, upcoming: 0, completed: 0 },
        financeAllowed: true,
        revenue: 0,
        expenses: 0,
      }),
    });
  });
}

async function mockDirectorBaseData(page: Page) {
  await page.route('**/rest/v1/company_attendance_settings?*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ timezone: 'Asia/Kolkata' }) });
  });
  for (const table of ['finance_accounts', 'finance_transactions', 'finance_invoices', 'payroll_entries', 'payroll_runs', 'crm_leads', 'crm_sales', 'attendance', 'leave_requests', 'tasks', 'document_requests', 'crm_lead_followups']) {
    await page.route(`**/rest/v1/${table}?*`, async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: route.request().method() === 'HEAD' ? '' : '[]' });
    });
  }
}

test('Director shows canonical Today separately from current-stage pipeline', async ({ page }) => {
  await mockCanonicalTodaySummary(page);
  await login(page, 'director');
  await navigateAfterLogin(page, '/admin');

  const todayCard = page.getByText("Today's Leads", { exact: true }).locator('..');
  await expect(todayCard).toContainText('7', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Leads by current stage' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Leads pipeline' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Director and CRM period lead and conversion cards match for every reporting period', async ({ page }) => {
  test.setTimeout(120_000);
  await mockCanonicalPeriodSummary(page);
  await mockDirectorBaseData(page);
  await login(page, 'director');
  await navigateAfterLogin(page, '/admin');

  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  if (await retry.isVisible({ timeout: 5_000 }).catch(() => false)) await retry.click();
  await expect(page.getByText('Leads this period', { exact: true })).toBeVisible({ timeout: 30_000 });

  const mainValues = new Map<string, string>();
  const mainRates = new Map<string, string>();
  for (const [preset, range] of [
    ['Today', crmDashboardPeriodRange('today', currentCrmBusinessDate())],
    ['This Week', crmDashboardPeriodRange('week', currentCrmBusinessDate())],
    ['This Month', crmDashboardPeriodRange('month', currentCrmBusinessDate())],
  ] as const) {
    const expected = Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000) + 1;
    await page.getByRole('button', { name: preset, exact: true }).click();
    await expect(page.getByRole('button', { name: preset, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const expectedRate = `${Math.round((Math.min(5, expected) / expected) * 100)}%`;
    await expect(page.getByText('Leads this period', { exact: true }).locator('..').locator('strong')).toHaveText(String(expected));
    await expect(page.getByText('Conversion rate', { exact: true }).locator('..').locator('strong')).toHaveText(expectedRate);
    mainValues.set(preset, String(expected));
    mainRates.set(preset, expectedRate);
  }

  const today = currentCrmBusinessDate();
  const customStart = shiftCrmDateKey(today, -9);
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByRole('dialog', { name: 'Custom dashboard period' }).getByLabel('Start date').fill(customStart);
  await page.getByRole('dialog', { name: 'Custom dashboard period' }).getByLabel('End date').fill(today);
  await page.getByRole('button', { name: 'Apply date range', exact: true }).click();
  await expect(page.getByText('Leads this period', { exact: true }).locator('..').locator('strong')).toHaveText('10');
  await expect(page.getByText('Conversion rate', { exact: true }).locator('..').locator('strong')).toHaveText('50%');
  mainValues.set('Custom', '10');
  mainRates.set('Custom', '50%');
  await expect(page.getByText('Active Leads — All Time', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await navigateAfterLogin(page, '/admin/crm');
  const monthRange = crmDashboardPeriodRange('month', today);
  const initialMonthTotal = Math.round((Date.parse(`${monthRange.end}T00:00:00Z`) - Date.parse(`${monthRange.start}T00:00:00Z`)) / 86_400_000) + 1;
  await expect(page.getByText('New Leads', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(String(initialMonthTotal));
  for (const preset of ['Today', 'This Week', 'This Month']) {
    await page.getByRole('button', { name: preset, exact: true }).click();
    await expect(page.getByText('New Leads', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(mainValues.get(preset) || '');
    await expect(page.getByText('Conversion Rate', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(mainRates.get(preset) || '');
  }
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByRole('dialog', { name: 'Custom CRM period' }).getByLabel('Start date').fill(customStart);
  await page.getByRole('dialog', { name: 'Custom CRM period' }).getByLabel('End date').fill(today);
  await page.getByRole('button', { name: 'Apply date range', exact: true }).click();
  await expect(page.getByText('New Leads', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(mainValues.get('Custom') || '');
  await expect(page.getByText('Conversion Rate', { exact: true }).locator('..').locator('p').nth(1)).toHaveText(mainRates.get('Custom') || '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('GM and CRM display the same canonical Today value', async ({ page }) => {
  await mockCanonicalTodaySummary(page);
  await login(page, 'general_manager');
  await navigateAfterLogin(page, '/admin');
  await expect(page.getByText('7 received today', { exact: true })).toBeVisible();

  await navigateAfterLogin(page, '/admin/crm');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const newLeads = page.getByText('New Leads', { exact: true }).locator('..');
  await expect(newLeads).toContainText('7');
  await expect(page.getByText('Outdoor Marketing', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('active Outdoor Marketing lookup reaches management create and filter surfaces', async ({ page }) => {
  await mockCanonicalTodaySummary(page, 0);
  await login(page, 'general_manager');
  await navigateAfterLogin(page, '/admin/crm/leads');
  await expect(page.getByRole('heading', { name: 'CRM / Leads' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Outdoor Marketing' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Add lead', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add lead' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Outdoor Marketing' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Close Add lead dialog', exact: true }).click();

  await navigateAfterLogin(page, '/admin/crm/sales');
  await expect(page.getByRole('option', { name: 'Outdoor Marketing' })).toHaveCount(1);
});
