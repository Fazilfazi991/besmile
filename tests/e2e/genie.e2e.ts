import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { login, navigateAfterLogin } from './helpers';

test.describe('Genie internal policy assistant', () => {
  test.beforeAll(() => mkdirSync('qa-artifacts/genie', { recursive: true }));

  test('blocks public page and API access', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/employee/genie');
    await expect(page).toHaveURL(/\/sign-in/);
    const response = await context.request.post('/api/genie', { data: { question: 'What are working hours?' } });
    expect(response.status()).toBe(401);
    await context.close();
  });

  test('answers with an exact citation in Standard Mode', async ({ page }) => {
    await login(page, 'employee');
    await navigateAfterLogin(page, '/employee/genie');
    await expect(page.getByRole('heading', { name: 'Genie' })).toBeVisible();
    await page.getByRole('button', { name: 'What are BSmile working hours?' }).click();
    await expect(page.locator('.genie-message-content > p').filter({ hasText: /9:00 AM to 6:00 PM/ })).toBeVisible();
    await expect(page.getByText(/4.2 Working Hours/)).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/genie/genie-standard-desktop.png', fullPage: true });
  });

  test('keeps the mobile conversation usable with footer navigation in Colorful Mode', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, 'employee');
    await page.evaluate(() => localStorage.setItem('bsmile-theme-mode', 'colorful'));
    await navigateAfterLogin(page, '/employee/genie');
    await page.getByLabel('Ask a policy question').fill('What are the standard timings for interns?');
    await page.getByRole('button', { name: 'Ask Genie' }).click();
    await expect(page.locator('.genie-message-content > p').filter({ hasText: /10AM-4PM/ })).toBeVisible();
    await expect(page.locator('.genie-composer')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Mobile primary navigation' });
    const policyShelf = page.locator('.genie-policy-shelf');
    await expect(nav).toHaveCSS('position', 'relative');
    const [navBox, shelfBox] = await Promise.all([nav.boundingBox(), policyShelf.boundingBox()]);
    expect(navBox).not.toBeNull();
    expect(shelfBox).not.toBeNull();
    expect(navBox!.y).toBeGreaterThanOrEqual(shelfBox!.y + shelfBox!.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await nav.scrollIntoViewIfNeeded();
    await expect(nav).toBeInViewport();
    await page.screenshot({ path: 'qa-artifacts/genie/genie-mobile-footer-390.png', fullPage: true });
    await context.close();
  });

  for (const width of [375, 430]) {
    test(`keeps the Genie footer navigation in flow at ${width}px`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 844 } });
      const page = await context.newPage();
      await login(page, 'employee');
      await navigateAfterLogin(page, '/employee/genie');
      const nav = page.getByRole('navigation', { name: 'Mobile primary navigation' });
      const policyShelf = page.locator('.genie-policy-shelf');
      await expect(nav).toHaveCSS('position', 'relative');
      const [navBox, shelfBox] = await Promise.all([nav.boundingBox(), policyShelf.boundingBox()]);
      expect(navBox).not.toBeNull();
      expect(shelfBox).not.toBeNull();
      expect(navBox!.y).toBeGreaterThanOrEqual(shelfBox!.y + shelfBox!.height - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await context.close();
    });
  }
});
