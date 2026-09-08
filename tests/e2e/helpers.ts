import { expect, Page } from '@playwright/test';
export type QaRole = 'admin' | 'general_manager' | 'manager' | 'employee';
export function credentials(role: QaRole) { const prefix = `BSMILE_QA_${role.toUpperCase()}`; const email = process.env[`${prefix}_EMAIL`]; const password = process.env[`${prefix}_PASSWORD`]; if (!email || !password) throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required`); return { email, password }; }
export async function login(page: Page, role: QaRole) { const account = credentials(role); for (let attempt = 0; attempt < 2; attempt += 1) { await page.goto('/sign-in'); await page.getByLabel('Email').fill(account.email); await page.getByLabel('Password').fill(account.password); await page.getByRole('button', { name: 'Sign in' }).click(); try { await expect(page).not.toHaveURL(/sign-in/, { timeout: 10_000 }); return; } catch (error) { if (attempt === 1) throw error; await page.waitForTimeout(1_000); } } }
export async function navigateAfterLogin(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      lastError = error;
      if (!/ERR_ABORTED|frame was detached/i.test(String(error)) || attempt === 2) throw error;
      await page.waitForTimeout(500 * (attempt + 1));
    }
  }
  throw lastError;
}
export async function assertNoRawDatabaseError(page: Page) { await expect(page.getByText(/row-level security|schema cache|postgrest|permission denied for (?:table|relation)|violates.*constraint|sqlstate/i)).toHaveCount(0); }
