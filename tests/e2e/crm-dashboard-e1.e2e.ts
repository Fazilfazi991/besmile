import { expect, test } from '@playwright/test';
import { currentCrmBusinessDate, formatCrmRangeLabel, shiftCrmDateKey } from '../../src/lib/crm-dashboard-e1';
import { assertNoRawDatabaseError, login, navigateAfterLogin, type QaRole } from './helpers';

for (const role of ['admin', 'general_manager', 'director'] as QaRole[]) {
  test(`CRM E1 date range and 30-day performance work for ${role}`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    const summaryRequests: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
    page.on('request', request => {
      if (request.url().includes('/rest/v1/rpc/crm_dashboard_summary')) summaryRequests.push(request.postData() || '');
    });

    await login(page, role);
    await navigateAfterLogin(page, '/admin/crm');
    await expect(page.getByRole('heading', { name: 'CRM Dashboard' })).toBeVisible();
    await expect(page.getByText(/Last 30 days · new leads by canonical lead date/i)).toBeVisible();
    await expect(page.getByTestId('lead-performance-total')).toBeVisible({ timeout: 30_000 });

    const rows = page.getByTestId('lead-performance-table').locator('tbody tr');
    await expect(rows).toHaveCount(30);
    const dailyValues = await rows.locator('td:last-child').allTextContents();
    const dailyTotal = dailyValues.reduce((sum, value) => sum + Number(value.trim()), 0);
    await expect(page.getByTestId('lead-performance-total')).toHaveText(String(dailyTotal));

    const fixedTableBefore = await page.getByTestId('lead-performance-table').textContent();
    const fixedTotalBefore = await page.getByTestId('lead-performance-total').textContent();
    for (const preset of ['Today', 'This Week', 'This Month']) {
      await page.getByRole('button', { name: preset, exact: true }).click();
      await expect(page.getByRole('button', { name: preset, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('crm-selected-range')).toContainText(preset);
      await expect(page.getByText('Refreshing CRM summary…')).toHaveCount(0, { timeout: 30_000 });
    }

    const custom = page.getByRole('button', { name: 'Custom', exact: true });
    const callsBeforeCancel = summaryRequests.length;
    await custom.click();
    await expect(page.getByRole('dialog', { name: 'Custom CRM period' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Custom CRM period' })).toHaveCount(0);
    await expect(custom).toBeFocused();
    await page.waitForTimeout(250);
    expect(summaryRequests).toHaveLength(callsBeforeCancel);

    await custom.click();
    await expect(page.getByRole('dialog', { name: 'Custom CRM period' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Custom CRM period' })).toHaveCount(0);
    await expect(custom).toBeFocused();

    const today = currentCrmBusinessDate();
    const start = shiftCrmDateKey(today, -6);
    const beforeInvalid = summaryRequests.length;
    await custom.click();
    const customDialog = page.getByRole('dialog', { name: 'Custom CRM period' });
    await page.getByLabel('Start date').fill('');
    await page.getByRole('button', { name: 'Apply date range' }).click();
    await expect(customDialog.getByRole('alert')).toContainText(/both a start date and an end date/i);
    await page.getByLabel('Start date').fill(today);
    await page.getByLabel('End date').fill(shiftCrmDateKey(today, -1));
    await page.getByRole('button', { name: 'Apply date range' }).click();
    await expect(customDialog.getByRole('alert')).toContainText(/start date must be on or before/i);
    await page.waitForTimeout(250);
    expect(summaryRequests).toHaveLength(beforeInvalid);

    await page.getByLabel('Start date').fill(start);
    await page.getByLabel('End date').fill(today);
    await page.getByRole('button', { name: 'Apply date range' }).click();
    await expect(page.getByRole('dialog', { name: 'Custom CRM period' })).toHaveCount(0);
    await expect(page.getByTestId('crm-selected-range')).toContainText('Custom');
    await expect(page.getByTestId('crm-selected-range')).toContainText(formatCrmRangeLabel({ start, end: today }));
    await expect(page.getByText('Refreshing CRM summary…')).toHaveCount(0, { timeout: 30_000 });
    expect(summaryRequests.length).toBe(beforeInvalid + 1);
    await expect(page.getByTestId('lead-performance-total')).toHaveText(fixedTotalBefore || '0');
    expect(await page.getByTestId('lead-performance-table').textContent()).toBe(fixedTableBefore);

    const inspector = page.getByRole('slider', { name: 'Inspect Lead Performance day' });
    await expect(inspector).toBeVisible();
    await inspector.focus();
    await page.keyboard.press('Home');
    await expect(page.locator('output')).toContainText((await rows.first().locator('td:first-child').textContent()) || '');
    await page.keyboard.press('End');
    await expect(page.locator('output')).toContainText((await rows.last().locator('td:first-child').textContent()) || '');

    const overflow = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
    await assertNoRawDatabaseError(page);
    expect(runtimeErrors).toEqual([]);
  });
}
