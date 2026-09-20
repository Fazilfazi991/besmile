import { expect, test, type Page } from '@playwright/test';
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
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await navigateAfterLogin(page, '/admin/crm/sales');
  await expect(page.getByRole('option', { name: 'Outdoor Marketing' })).toHaveCount(1);
});
