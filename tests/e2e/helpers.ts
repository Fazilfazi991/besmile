import { expect, Page, Request, Response } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordFixtureLoginRetry } from './fixture-auth';
export type QaRole = 'admin' | 'general_manager' | 'director' | 'manager' | 'employee' | 'assistant_manager' | 'psychologist';
export function credentials(role: QaRole) { const prefix = `BSMILE_QA_${role.toUpperCase()}`; const email = process.env[`${prefix}_EMAIL`]; const password = process.env[`${prefix}_PASSWORD`]; if (!email || !password) throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required`); return { email, password }; }
export async function login(page: Page, role: QaRole) {
  const account = credentials(role);
  const statePath = join(process.cwd(), 'release-evidence', 'auth-state', `${role}.json`);
  const metadataPath = join(process.cwd(), 'release-evidence', 'auth-state', `${role}.meta.json`);
  const stateMatchesAccount = existsSync(metadataPath)
    && (JSON.parse(readFileSync(metadataPath, 'utf8')) as { email?: string }).email === account.email;
  if (existsSync(statePath) && stateMatchesAccount) {
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as { cookies?: any[] };
    if (state.cookies?.length) await page.context().addCookies(state.cookies);
    const landing = ['admin', 'general_manager', 'director', 'manager'].includes(role) ? '/admin' : '/employee/dashboard';
    await page.goto(landing);
    await expect(page).toHaveURL(/\/(?:admin|employee|clinician)(?:\/|$)/, { timeout: 10_000 });
    await page.waitForLoadState('load', { timeout: 30_000 });
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30_000 });
    return;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let transportFailure = false;
    let tokenAccepted = false;
    let tokenResponseSeen = false;
    const failed = (request: Request) => {
      if (request.url().includes('/auth/v1/token') && /ERR_CONNECTION_RESET|ERR_TIMED_OUT/.test(request.failure()?.errorText || '')) transportFailure = true;
    };
    const response = (result: Response) => {
      if (!result.url().includes('/auth/v1/token')) return;
      tokenResponseSeen = true;
      if (result.status() >= 200 && result.status() < 300) tokenAccepted = true;
      if ([502,503,504].includes(result.status())) transportFailure = true;
    };
    page.on('requestfailed', failed);
    page.on('response', response);
    try {
      await page.goto('/sign-in');
      await page.getByLabel('Email').fill(account.email);
      await page.getByLabel('Password').fill(account.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      // A changed URL only proves navigation committed, not that the authenticated
      // landing document finished loading. Do not interrupt its bootstrap.
      await expect(page).toHaveURL(/\/(?:admin|employee|clinician)(?:\/|$)/, { timeout: 10_000 });
      await page.waitForLoadState('load', { timeout: 30_000 });
      await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30_000 });
      return;
    } catch (error) {
      // A successful token exchange can occasionally be followed by an aborted
      // first document bootstrap. Retry that exact sign-in bounce once; invalid
      // credentials, unauthorized landings, and missing shells remain failures.
      // A token request that never produces either a response or a browser-level
      // failure is also transport infrastructure, not an authorization result.
      const postAuthBootstrapFailure = tokenAccepted && /\/sign-in(?:[?#].*)?$/.test(page.url());
      const stalledTokenRequest = !tokenResponseSeen
        && /\/sign-in(?:[?#].*)?$/.test(page.url())
        && await page.getByRole('button', { name: 'Signing in...' }).isDisabled().catch(() => false);
      if (attempt === 1 || (!transportFailure && !postAuthBootstrapFailure && !stalledTokenRequest)) throw error;
      recordFixtureLoginRetry(role, postAuthBootstrapFailure ? 'post-auth-bootstrap' : 'transient-transport');
      await page.waitForTimeout(150);
    } finally {
      page.off('requestfailed', failed);
      page.off('response', response);
    }
  }
}
export async function navigateAfterLogin(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      return;
    } catch (error) {
      lastError = error;
      if (!/ERR_ABORTED|frame was detached|Timeout.*exceeded/i.test(String(error)) || attempt === 2) throw error;
      await page.waitForTimeout(500 * (attempt + 1));
    }
  }
  throw lastError;
}
export async function assertNoRawDatabaseError(page: Page) { await expect(page.getByText(/could not embed|more than one relationship|row-level security|schema cache|postgrest|permission denied for (?:table|relation)|violates.*constraint|sqlstate/i)).toHaveCount(0); }
