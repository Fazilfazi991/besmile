import { expect, test } from '@playwright/test';
import { login, navigateAfterLogin } from './helpers';

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, 'general_manager');
});

test('Clients keeps its wide table inside a local horizontal scroll region', async ({ page }) => {
  await navigateAfterLogin(page, '/admin/patients');
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  const region = page.getByRole('region', { name: 'Client records' });
  await expect(region).toBeVisible();
  await expect(region.getByRole('columnheader', { name: 'Actions' })).toHaveCount(1);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await region.evaluate(element => element.scrollWidth >= element.clientWidth)).toBe(true);

  await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(region.getByRole('columnheader', { name: 'Actions' })).toBeInViewport();

  await page.evaluate(() => { document.documentElement.dataset.theme = 'colorful'; });
  await expect(region).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Add lead owns validation feedback and the active interaction layer', async ({ page }) => {
  await navigateAfterLogin(page, '/admin/crm/leads');
  await expect(page.getByRole('heading', { name: 'CRM / Leads' })).toBeVisible();
  await page.getByRole('button', { name: 'Add lead', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add lead' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Add lead', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Enter a lead name and a phone number with at least 7 digits.');
  await expect(page.locator('.crm-leads-workspace > .module-alert-error')).toHaveCount(0);
  expect(await page.locator('.crm-lead-modal-layer').evaluate(element => getComputedStyle(element).zIndex)).toBe('120');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  await dialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole('button', { name: 'Add lead', exact: true })).toBeInViewport();

  await page.evaluate(() => { document.documentElement.dataset.theme = 'colorful'; });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await expect(page.getByRole('button', { name: 'Add lead', exact: true })).toBeFocused();
});
