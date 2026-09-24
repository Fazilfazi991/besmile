import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { credentials, login } from './helpers';

const output = join(process.cwd(), 'artifacts', 'organization-chart');
const person = (id: string, full_name: string, designation: string, manager_id: string | null, extra = {}) => ({
  id, full_name, designation, manager_id, department_id: null, department_name: 'Clinical Services', avatar_url: null, status: 'active', can_edit: false, ...extra,
});
const small = [
  person('chair', 'Aisha Chairman', 'Chairman', null),
  person('director', 'Benjamin Director', 'Director', null),
  person('gm', 'Chandra General Manager', 'General Manager', null),
  person('lead', 'Dalia Program Lead With A Very Long Name', 'Senior Operations and Program Development Lead', 'gm'),
  person('report', 'Evan Therapist', 'Therapist', 'lead'),
  person('solo', 'Farah Marketing', 'Marketing Executive', 'missing-manager'),
  person('inactive', 'Inactive Person', 'Staff', 'gm', { status: 'inactive' }),
];
const large = [...small, ...Array.from({ length: 25 }, (_, index) => person(`extra-${index}`, `Staff Member ${index + 1}`, 'Specialist', index < 10 ? 'gm' : `extra-${index - 10}`)), person('qa-visual-viewer', 'QA Visual Viewer', 'Specialist', 'extra-20')];

async function mount(page: Page, rows: typeof small) {
  await page.route('**/rest/v1/profiles?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'qa-visual-viewer', full_name: 'QA Visual Viewer', email: 'qa@example.com', role: 'employee', status: 'active', department: { name: 'Clinical Services' }, avatar_url: null, manager_id: null }) }));
  await page.route('**/rest/v1/rpc/organization_directory', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
  await page.goto('/employee/profile');
  await expect(page.getByRole('heading', { name: 'Organization chart' })).toBeVisible();
  await expect(page.getByText('Loading organization…')).toHaveCount(0);
}

async function settledViewport(page: Page) {
  return page.locator('.organization-flow-canvas .react-flow__viewport').evaluate(async element => {
    let previous = '';
    let stableFrames = 0;
    for (let frame = 0; frame < 180; frame += 1) {
      await new Promise(requestAnimationFrame);
      const current = (element as HTMLElement).style.transform;
      stableFrames = current === previous ? stableFrames + 1 : 0;
      if (stableFrames >= 4) return current;
      previous = current;
    }
    throw new Error('Organization viewport did not settle');
  });
}

async function loginVisual(page: Page, browserName: string) {
  if (browserName !== 'webkit') return login(page, 'employee', { reuseState: false });
  const account = credentials('employee');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(account.password);
    await expect(page.getByLabel('Email')).toHaveValue(account.email);
    await expect(page.getByLabel('Password')).toHaveValue(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    try {
      await expect(page).toHaveURL(/\/employee\/dashboard/, { timeout: 20_000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

test('responsive chart, roots, list, controls, and refresh', async ({ page, browserName }) => {
  mkdirSync(output, { recursive: true });
  await loginVisual(page, browserName);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await mount(page, small);
    if (viewport.width <= 700) {
      await expect(page.getByRole('region', { name: 'Organization hierarchy list' })).toBeVisible();
      await expect(page.locator('.organization-list-person')).toHaveCount(6);
      await page.locator('.organization-chart-section').screenshot({ path: join(output, `${browserName}-${viewport.width}-list.png`) });
      await page.getByRole('button', { name: 'Chart', exact: true }).click();
    }
    const chart = page.getByRole('region', { name: 'Pannable organization chart' });
    await expect(chart).toBeVisible();
    await expect(chart.locator('.react-flow__node-person')).toHaveCount(6);
    await expect(chart.locator('.react-flow__edge')).toHaveCount(2);
    const overlap = await chart.locator('.react-flow__node-person').evaluateAll(nodes => {
      const boxes = nodes.map(node => node.getBoundingClientRect());
      return boxes.some((a, i) => boxes.some((b, j) => i < j && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2));
    });
    expect(overlap).toBe(false);
    const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 2);
    await page.locator('.organization-chart-section').screenshot({ path: join(output, `${browserName}-${viewport.width}-small.png`) });
    await page.getByRole('button', { name: 'Fit chart' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    const beforeRefresh = await settledViewport(page);
    await page.getByRole('button', { name: 'Refresh chart' }).click();
    expect(await settledViewport(page)).toBe(beforeRefresh);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.locator('.organization-list-person')).toHaveCount(6);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await mount(page, small.map(row => row.id === 'chair' ? { ...row, can_edit: true } : row));
  await expect(page.locator('[data-org-edit-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Expand chart' }).click();
  await expect(page.getByRole('dialog', { name: 'Organization chart' })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  expect(await page.evaluate(() => Boolean(document.querySelector('nav')?.closest('[inert]')))).toBe(true);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.organization-chart-section')))).toBe(true);
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.organization-chart-section')))).toBe(true);
  }
  await page.getByRole('button', { name: 'Edit organization details for Aisha Chairman' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit organization details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Edit organization details' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Organization chart' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Organization chart' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand chart' })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.setViewportSize({ width: 1366, height: 768 });
  await mount(page, large);
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  const chart = page.getByRole('region', { name: 'Pannable organization chart' });
  await expect.poll(() => chart.locator('.react-flow__node-person').count()).toBeGreaterThan(0);
  const overviewCount = await chart.locator('.react-flow__node-person').count();
  expect(overviewCount).toBe(15);
  await page.locator('.organization-chart-section').screenshot({ path: join(output, `${browserName}-1366-large-overview.png`) });
  await page.getByRole('button', { name: 'Refresh chart' }).click();
  await expect(chart.locator('.react-flow__node-person')).toHaveCount(overviewCount);
  await page.getByRole('button', { name: 'Find me' }).click();
  await expect(chart.locator('[data-employee-id="qa-visual-viewer"]')).toBeVisible();
  await expect(chart.locator('.react-flow__node-person')).not.toHaveCount(overviewCount);
});

test('same large directory at every viewport in Standard and Colorful modes', async ({ page, browserName }) => {
  mkdirSync(output, { recursive: true });
  await loginVisual(page, browserName);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await mount(page, large);
    if (viewport.width <= 700) {
      const list = page.getByRole('region', { name: 'Organization hierarchy list' });
      await expect(list).toBeVisible();
      for (const theme of ['standard', 'colorful']) {
        await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
        await page.locator('.organization-chart-section').screenshot({ path: join(output, `${browserName}-large-${viewport.width}-${theme}-initial-list.png`) });
      }
      await page.getByRole('button', { name: 'Chart', exact: true }).click();
    }
    const chart = page.getByRole('region', { name: 'Pannable organization chart' });
    await expect(chart.locator('.react-flow__node-person')).toHaveCount(15);
    for (const theme of ['standard', 'colorful']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await settledViewport(page);
      await page.locator('.organization-chart-section').screenshot({ path: join(output, `${browserName}-large-${viewport.width}-${theme}-initial-chart.png`) });
    }
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByRole('button', { name: /Show 1 report for Dalia Program Lead/ }).click();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(chart.locator('.react-flow__node-person')).toHaveCount(16);
    for (const theme of ['standard', 'colorful']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await settledViewport(page);
      await page.locator('.organization-chart-section').screenshot({ path: join(output, `${browserName}-large-${viewport.width}-${theme}-expanded-chart.png`) });
    }
    const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 2);
  }
});
