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

  test('allows an authenticated internal admin to open Genie', async ({ page }) => {
    await login(page, 'admin');
    await navigateAfterLogin(page, '/admin/genie');
    await expect(page).toHaveURL(/\/admin\/genie$/);
    await expect(page.getByRole('heading', { name: 'Genie' })).toBeVisible();
    await page.screenshot({ path: 'qa-artifacts/genie/genie-chat-flow-admin-desktop.png', fullPage: true });
  });

  test('answers with an exact citation, then handles an acknowledgement without retrieval', async ({ page }) => {
    let geniePosts = 0;
    await page.route('**/api/genie', async (route) => {
      if (route.request().postData()?.includes('moonlighting'))
        await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/genie')) geniePosts += 1;
    });
    await login(page, 'employee');
    await navigateAfterLogin(page, '/employee/genie');
    await expect(page.getByRole('heading', { name: 'Genie' })).toBeVisible();
    await page.getByRole('button', { name: 'What are BSmile working hours?' }).click();
    await expect(page.locator('.genie-message-content > p').filter({ hasText: /9:00 AM to 6:00 PM/ })).toBeVisible();
    await expect(page.getByText(/4.2 Working Hours/)).toBeVisible();
    expect(geniePosts).toBe(1);
    await page.getByLabel('Ask a policy question').fill('ok');
    await page.getByRole('button', { name: 'Ask Genie' }).click();
    await expect(page.getByText('Got it. Ask me anything else about the approved BSmile policies.')).toBeVisible();
    expect(geniePosts).toBe(1);
    const messages = await page.locator('.genie-message').allTextContents();
    expect(messages.at(-2)?.replace(/\s/g, '')).toContain('Youok');
    expect(messages.at(-1)?.replace(/\s/g, '')).toContain('GenieGotit.');
    expect(await page.locator('.genie-thread').evaluate((thread) =>
      thread.scrollHeight - thread.scrollTop - thread.clientHeight,
    )).toBeLessThanOrEqual(2);

    for (const acknowledgement of ['thanks', 'understood']) {
      await page.getByLabel('Ask a policy question').fill(acknowledgement);
      await page.getByRole('button', { name: 'Ask Genie' }).click();
    }
    expect(geniePosts).toBe(1);
    await page.getByLabel('Ask a policy question').fill('What is the moonlighting policy?');
    await page.getByRole('button', { name: 'Ask Genie' }).click();
    const thread = page.locator('.genie-thread');
    await expect(page.locator('.genie-message-user').filter({ hasText: 'moonlighting' })).toBeVisible();
    await thread.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(page.locator('.genie-message-content > p').filter({ hasText: /strictly prohibited/ })).toBeVisible();
    expect(await thread.evaluate((element) =>
      element.scrollHeight - element.scrollTop - element.clientHeight,
    )).toBeGreaterThan(96);
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
    await page.getByLabel('Ask a policy question').fill('thank you');
    await page.getByRole('button', { name: 'Ask Genie' }).click();
    await expect(page.getByText('Got it. Ask me anything else about the approved BSmile policies.')).toBeVisible();
    await expect(page.locator('.genie-composer')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Mobile primary navigation' });
    const policyShelf = page.locator('.genie-policy-shelf');
    await expect(nav).toHaveCSS('position', 'relative');
    const [navBox, shelfBox] = await Promise.all([nav.boundingBox(), policyShelf.boundingBox()]);
    expect(navBox).not.toBeNull();
    expect(shelfBox).not.toBeNull();
    expect(navBox!.y).toBeGreaterThanOrEqual(shelfBox!.y + shelfBox!.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.locator('.genie-thread').evaluate((thread) =>
      thread.scrollHeight - thread.scrollTop - thread.clientHeight,
    )).toBeLessThanOrEqual(2);
    await nav.scrollIntoViewIfNeeded();
    await expect(nav).toBeInViewport();
    await page.screenshot({ path: 'qa-artifacts/genie/genie-chat-flow-mobile-390.png', fullPage: true });
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
