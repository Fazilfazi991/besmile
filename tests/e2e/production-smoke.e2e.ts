import { expect, test } from '@playwright/test';
import { assertNoRawDatabaseError, login } from './helpers';
test('non-destructive production module smoke', async ({ page }) => { test.skip(process.env.BSMILE_PRODUCTION_SMOKE !== '1', 'Explicit opt-in required'); await login(page, 'general_manager'); for (const route of ['/admin', '/admin/tasks', '/admin/chat', '/admin/attendance', '/admin/leaves', '/admin/daily-work', '/admin/profile', '/admin/reports']) { await page.goto(route); await expect(page.locator('main,section').first()).toBeVisible(); await assertNoRawDatabaseError(page); } });
