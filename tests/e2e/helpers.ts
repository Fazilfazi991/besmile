import { expect, Page } from '@playwright/test';
export type QaRole = 'admin' | 'general_manager' | 'manager' | 'employee';
export function credentials(role: QaRole) { const prefix = `BSMILE_QA_${role.toUpperCase()}`; const email = process.env[`${prefix}_EMAIL`]; const password = process.env[`${prefix}_PASSWORD`]; if (!email || !password) throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required`); return { email, password }; }
export async function login(page: Page, role: QaRole) { const account = credentials(role); await page.goto('/sign-in'); await page.getByLabel('Email').fill(account.email); await page.getByLabel('Password').fill(account.password); await page.getByRole('button', { name: 'Sign in' }).click(); await expect(page).not.toHaveURL(/sign-in/); }
export async function assertNoRawDatabaseError(page: Page) { await expect(page.getByText(/row-level security|schema cache|postgrest|violates.*constraint|sqlstate/i)).toHaveCount(0); }
