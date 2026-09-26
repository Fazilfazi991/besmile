import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('executive dashboard shows full INR amounts without overflowing cards', async ({ page }) => {
  await login(page, 'director', { waitForLanding: true });
  if (await page.getByRole('heading', { name: 'Executive overview unavailable' }).isVisible()) await page.reload();
  const dashboard = page.locator('.director-dashboard');
  await expect(dashboard.getByRole('heading', { name: 'Finance Overview' })).toBeVisible({ timeout: 30_000 });

  const amounts = dashboard.locator('.director-kpi strong, section[aria-labelledby="executive-finance-title"] article strong, [class*="donutCenter"] strong, [class*="breakdownRow"] small span:first-child');
  const values = (await amounts.allTextContents()).filter(value => value.startsWith('INR '));
  expect(values.length).toBeGreaterThanOrEqual(6);
  for (const value of values) {
    expect(value).toMatch(/^INR -?[\d,]+(?:\.\d{1,2})?$/);
  }
  const invoiceLegend = await dashboard.locator('.director-kpi').filter({ hasText: 'Outstanding invoices' }).locator('.kpi-chart-legend b').allTextContents();
  expect(invoiceLegend.length).toBeGreaterThan(0);
  for (const value of invoiceLegend) expect(value).toMatch(/^INR -?[\d,]+(?:\.\d{1,2})?$/);

  await page.evaluate(() => {
    for (const element of document.querySelectorAll('.director-kpi strong, section[aria-labelledby="executive-finance-title"] article strong')) {
      if (element.textContent?.startsWith('INR ')) element.textContent = 'INR 12,34,56,789.50';
    }
  });
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll<HTMLElement>('.director-kpi strong, section[aria-labelledby="executive-finance-title"] article strong')]
      .filter(element => element.textContent?.startsWith('INR ') && element.scrollWidth > element.clientWidth + 1)
      .map(element => element.textContent),
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.clipped).toEqual([]);
});
