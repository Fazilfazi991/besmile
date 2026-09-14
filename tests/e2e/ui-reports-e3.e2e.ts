import { expect, test, type Locator, type Page } from '@playwright/test';
import { assertNoRawDatabaseError, login, navigateAfterLogin } from './helpers';

async function enableColorfulMode(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('bsmile-theme-mode', 'colorful');
    document.documentElement.dataset.theme = 'colorful';
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'colorful');
}

async function expectNoDocumentOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function expectReadableTitle(title: Locator) {
  const contrast = await title.evaluate(node => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const channels = rgb(value).map(channel => { const normalized = channel / 255; return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; });
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const foreground = luminance(getComputedStyle(node).color);
    const background = luminance(getComputedStyle(document.querySelector('.app-shell')!).backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test('Operational Reports applies a validated range to data and exports', async ({ page }) => {
  const reportRequests: string[] = [];
  page.on('request', request => {
    const url = decodeURIComponent(request.url());
    if (url.includes('/rest/v1/crm_leads?') && url.includes('select=lead_date,full_name')) reportRequests.push(url);
  });
  await login(page, 'admin');
  await navigateAfterLogin(page, '/admin/reports');
  await enableColorfulMode(page);
  await expect(page.getByRole('heading', { name: 'Operational reports' })).toBeVisible({ timeout: 30_000 });
  await expectReadableTitle(page.getByRole('heading', { name: 'Operational reports' }));
  await expect(page.getByTestId('operational-report-range')).toContainText('All dates');
  await expect.poll(() => reportRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByText(/Loading leads report/i)).toHaveCount(0, { timeout: 30_000 });

  const requestsBeforeDraft = reportRequests.length;
  await page.getByLabel('Start date').fill('2026-09-01');
  await page.waitForTimeout(200);
  expect(reportRequests).toHaveLength(requestsBeforeDraft);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.operational-report-range-error')).toContainText(/both a start date and an end date/i);
  expect(reportRequests).toHaveLength(requestsBeforeDraft);

  await page.getByLabel('Start date').fill('2026-09-14');
  await page.getByLabel('End date').fill('2026-09-01');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.operational-report-range-error')).toContainText(/start date must be on or before/i);
  expect(reportRequests).toHaveLength(requestsBeforeDraft);

  await page.getByLabel('Start date').fill('2026-09-01');
  await page.getByLabel('End date').fill('2026-09-14');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText(/Loading leads report/i)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('operational-report-range')).toContainText('1 Sept 2026 – 14 Sept 2026');
  expect(reportRequests.some(url => url.includes('lead_date=gte.2026-09-01') && url.includes('lead_date=lte.2026-09-14'))).toBe(true);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('bsmile-leads-report-2026-09-01_2026-09-14.csv');
  const mobile = page.viewportSize()!.width <= 760;
  expect(await page.locator('.operational-report-table-wrap').evaluate(node => getComputedStyle(node).display)).toBe(mobile ? 'none' : 'block');
  expect(await page.locator('.operational-report-mobile').evaluate(node => getComputedStyle(node).display)).toBe(mobile ? 'grid' : 'none');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByTestId('operational-report-range')).toContainText('All dates');
  await expectNoDocumentOverflow(page);
  await assertNoRawDatabaseError(page);
});

test('Colorful Mode has readable, non-white E3 workspaces', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'employee');
  const routes: Array<[string, string]> = [
    ['/employee/dashboard', '.employee-dashboard'],
    ['/employee/tasks', '.task-management-workspace'],
    ['/employee/leaves', '.leave-self-service'],
    ['/employee/attendance', '.attendance-workspace'],
    ['/employee/daily-work', '.daily-work-workspace'],
    ['/employee/notifications', '.organization-notifications'],
    ['/employee/holidays', '.holiday-calendar'],
    ['/employee/chat', '.chat-hub'],
  ];
  for (const [path, selector] of routes) {
    await navigateAfterLogin(page, path);
    await enableColorfulMode(page);
    const root = page.locator(selector);
    await expect(root).toBeVisible({ timeout: 30_000 });
    const title = root.locator('h1:visible,h2:visible').first();
    await expect(title).toBeVisible();
    await expectReadableTitle(title);
    const surface = root.locator('.card,.employee-section,.attendance-records,.chat-layout').first();
    if (await surface.count()) expect(await surface.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    await expectNoDocumentOverflow(page);
    await assertNoRawDatabaseError(page);
  }
});

test('Task Management keeps titles, ownership, SLA, actions, and empty states legible', async ({ page }) => {
  await login(page, 'admin');
  await navigateAfterLogin(page, '/admin/tasks');
  await enableColorfulMode(page);
  await expect(page.getByRole('heading', { name: 'Task Management' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Current tasks')).toBeVisible();
  const mobile = page.viewportSize()!.width < 768;
  const mobileTask = page.locator('.task-management-workspace article>button').first();
  const desktopActions = page.locator('.task-management-workspace details:visible').first();
  if ((mobile && await mobileTask.count()) || (!mobile && await desktopActions.count())) {
    if (mobile) await mobileTask.click();
    else {
      await desktopActions.locator('summary').click();
      await desktopActions.getByRole('button', { name: 'View details', exact: true }).click();
    }
    const dialog = page.getByRole('dialog', { name: /.+/ }).last();
    await expect(dialog.getByText('Task Owner', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Completion SLA', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close task details' })).toBeVisible();
  } else {
    await expect(page.getByText(/No tasks/i).first()).toBeVisible();
  }
  if (page.viewportSize()!.width <= 600) expect((await page.getByRole('button', { name: /Create New Task/i }).first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoDocumentOverflow(page);
  await assertNoRawDatabaseError(page);
});

test('Holiday cues and recursive organization chart remain aligned without color alone', async ({ page }) => {
  await login(page, 'employee');
  await navigateAfterLogin(page, '/employee/holidays');
  await expect(page.locator('.holiday-calendar')).toBeVisible({ timeout: 30_000 });
  for (const category of ['holiday', 'awareness', 'observance', 'weekly']) {
    const chip = page.locator(`.holiday-legend .${category}`).first();
    await expect(chip).toBeVisible();
    expect(await chip.evaluate(node => getComputedStyle(node, '::before').content)).not.toBe('none');
  }
  await enableColorfulMode(page);
  await expectNoDocumentOverflow(page);

  await navigateAfterLogin(page, '/employee/profile');
  await enableColorfulMode(page);
  await expect(page.locator('.organization-chart-section')).toBeVisible({ timeout: 30_000 });
  const mobile = page.viewportSize()!.width <= 700;
  await expect(page.locator(mobile ? '.organization-chart-mobile' : '.organization-chart-tree')).toBeVisible();
  const cards = page.locator(`${mobile ? '.organization-chart-mobile' : '.organization-chart-tree'} .organization-chart-card`);
  await expect(cards).toHaveCount(7);
  expect(await cards.evaluateAll(nodes => nodes.every(node => { const box = node.getBoundingClientRect(); return box.left >= -1 && box.right <= document.documentElement.clientWidth + 1; }))).toBe(true);
  await expectNoDocumentOverflow(page);
  await assertNoRawDatabaseError(page);
});

test('Important and Chat tabs align and Annual Leave stays out of active controls', async ({ page }) => {
  await login(page, 'employee');
  await navigateAfterLogin(page, '/employee/notifications');
  await expect(page.locator('.notification-stream-tabs')).toBeVisible({ timeout: 30_000 });
  const tabs = page.locator('.notification-stream-tabs button');
  await expect(tabs).toHaveCount(2);
  const boxes = await tabs.evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { top: box.top, height: box.height, width: box.width }; }));
  expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThan(1);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(1);
  if (page.viewportSize()!.width <= 700) expect(Math.min(...boxes.map(box => box.height))).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: /^Chat/ }).click();
  const chatLink = page.getByRole('link', { name: /Open chat/i });
  await expect(chatLink).toBeVisible();
  if (page.viewportSize()!.width <= 700) expect((await chatLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoDocumentOverflow(page);

  await navigateAfterLogin(page, '/employee/leaves');
  const leaveType = page.getByLabel('Leave type');
  await expect(leaveType).toBeVisible({ timeout: 30_000 });
  expect((await leaveType.locator('option').allTextContents()).some(label => /annual leave/i.test(label))).toBe(false);
  await expectNoDocumentOverflow(page);
  await assertNoRawDatabaseError(page);
});
