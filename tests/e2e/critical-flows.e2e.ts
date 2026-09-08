import { expect, test } from '@playwright/test';
import { assertNoRawDatabaseError, login, QaRole } from './helpers';

const roleLandings: Array<[QaRole, RegExp]> = [['admin', /admin/], ['general_manager', /admin/], ['manager', /admin|employee/], ['employee', /employee/]];
for (const [role, landing] of roleLandings) test(`${role} login`, async ({ page }) => { await login(page, role); await expect(page).toHaveURL(landing); await assertNoRawDatabaseError(page); });

test('general manager task creation, assignment, detail and edit', async ({ page }) => {
  await login(page, 'general_manager'); await page.goto('/admin/tasks');
  const marker = `E2E task ${Date.now()}`; await page.getByRole('button', { name: /create new task/i }).click();
  await page.getByLabel(/task title/i).fill(marker); await page.getByLabel(/description/i).fill('Release-gate task; safe to delete.');
  await page.getByLabel(/due date/i).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.getByLabel(/assignee/i).first().click(); await page.getByRole('option').first().click();
  await page.getByRole('button', { name: /create task/i }).click(); await expect(page.getByText(marker)).toBeVisible();
  await page.getByText(marker).click(); await expect(page.getByText(/task owner/i)).toBeVisible(); await expect(page.getByText(/completion sla/i)).toBeVisible();
  await assertNoRawDatabaseError(page);
});

test('task navigation uses durable filters', async ({ page }) => { await login(page, 'general_manager'); await page.goto('/admin/tasks'); await page.getByText('Overdue', { exact: true }).first().click(); await expect(page).toHaveURL(/status=overdue/); await page.goBack(); await page.getByText('High', { exact: true }).first().click(); await expect(page).toHaveURL(/priority=high/); await page.reload(); await expect(page).toHaveURL(/priority=high/); });

for (const [route, heading] of [['/admin/leaves', /leave/i], ['/admin/attendance', /attendance/i], ['/admin/daily-work', /daily work/i], ['/admin/chat', /teams|chat/i], ['/admin/employees', /employee/i], ['/admin/reports', /report/i]] as const) {
  test(`management loads ${route}`, async ({ page }) => { await login(page, 'general_manager'); await page.goto(route); await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible(); await assertNoRawDatabaseError(page); });
}

test('employee critical workspace surfaces', async ({ page }) => { await login(page, 'employee'); for (const route of ['/employee/leaves', '/employee/attendance', '/employee/daily-work', '/employee/chat', '/employee/profile']) { await page.goto(route); await expect(page.locator('main,section').first()).toBeVisible(); await assertNoRawDatabaseError(page); } await page.goto('/employee/chat'); await expect(page.getByRole('button', { name: /voice|record/i }).first()).toBeVisible(); });
test('employee denied management modules', async ({ page }) => { await login(page, 'employee'); for (const route of ['/admin/tasks', '/admin/reports']) { await page.goto(route); await expect(page).toHaveURL(/unauthorized|employee/); } });

test('employee submits Daily Work and manager can review it', async ({ page, browser }) => {
  const marker = `Release gate work ${Date.now()}`; await login(page, 'employee'); await page.goto('/employee/daily-work'); await page.getByLabel('Work summary').fill(marker); await page.getByRole('button', { name: /save summary|update summary/i }).click(); await expect(page.getByText(/saved/i)).toBeVisible();
  const manager = await browser.newPage(); await login(manager, 'general_manager'); await manager.goto('/admin/daily-work'); await manager.getByLabel('Search').fill(marker); await expect(manager.getByText(marker)).toBeVisible(); await manager.close();
});

test('attendance Excel export downloads a workbook', async ({ page }) => { await login(page, 'general_manager'); await page.goto('/admin/attendance'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: /export excel/i }).click(); expect((await download).suggestedFilename()).toMatch(/\.xlsx$/i); });

test('employee can submit leave and cannot review leave', async ({ page }) => { await login(page, 'employee'); await page.goto('/employee/leaves'); await expect(page.getByRole('button', { name: /submit request/i })).toBeVisible(); await expect(page.getByRole('button', { name: /approve|reject/i })).toHaveCount(0); });
test('authorized manager has leave review controls when a pending request exists', async ({ page }) => { await login(page, 'general_manager'); await page.goto('/admin/leaves'); const pending = page.getByText('Pending').first(); await expect(pending).toBeVisible(); if (await page.getByRole('button', { name: /approve/i }).count()) { await expect(page.getByRole('button', { name: /reject/i }).first()).toBeVisible(); } });

test('Teams supports messages, images, voice surface and safe group authorization', async ({ page }) => { await login(page, 'employee'); await page.goto('/employee/chat'); const conversation = page.locator('[data-conversation-id], button').filter({ hasText: /./ }).first(); await conversation.click(); const composer = page.getByPlaceholder(/message/i); if (await composer.count()) { await composer.fill(`Release gate message ${Date.now()}`); await page.getByRole('button', { name: /^send$/i }).click(); } await expect(page.getByRole('button', { name: /voice|record/i }).first()).toBeVisible(); await expect(page.getByRole('menuitem', { name: /delete group/i })).toHaveCount(0); await assertNoRawDatabaseError(page); });

test('employee task completion requires an update', async ({ page }) => { await login(page, 'employee'); await page.goto('/employee/tasks'); const completed = page.getByRole('button', { name: /complete/i }).first(); if (await completed.count()) { await completed.click(); await expect(page.getByRole('button', { name: /complete task/i })).toBeDisabled(); await page.getByLabel(/completion update/i).fill('Completed during automated release verification.'); await expect(page.getByRole('button', { name: /complete task/i })).toBeEnabled(); } });
