import { expect, test, Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { login, navigateAfterLogin, credentials, assertNoRawDatabaseError } from './helpers';
import { fixtureLogin } from './fixture-auth';

// Owner-approved, disposable QA identity. Privileged access is provisioning-only;
// all application assertions use its normal password login and browser session.
let fixtureId: string | undefined;
let fixtureAdmin: SupabaseClient;
test.beforeAll(async () => {
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(process.env.BSMILE_QA_SUPABASE_URL!).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('Polish fixture requires QA');
  const key = process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('QA provisioning credential missing');
  fixtureAdmin = createClient(process.env.BSMILE_QA_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `polish-assistant-${crypto.randomUUID()}@qa.bsmile.local`;
  const password = `${crypto.randomUUID()}Aa9!`;
  const created = await fixtureAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Could not provision QA Assistant Manager');
  fixtureId = created.data.user.id;
  const profile = await fixtureAdmin.from('profiles').upsert({ id: fixtureId, email, full_name: 'QA Polish Assistant Manager', role: 'staff', designation: 'Assistant Manager', status: 'active', is_employee: true });
  if (profile.error) throw new Error('Could not provision QA Assistant Manager profile');
  process.env.BSMILE_QA_ASSISTANT_MANAGER_EMAIL = email;
  process.env.BSMILE_QA_ASSISTANT_MANAGER_PASSWORD = password;
});
test.afterAll(async () => {
  if (fixtureId) {
    const removed = await fixtureAdmin.auth.admin.deleteUser(fixtureId);
    if (removed.error) throw new Error('Disposable QA Assistant Manager cleanup failed');
  }
  delete process.env.BSMILE_QA_ASSISTANT_MANAGER_EMAIL;
  delete process.env.BSMILE_QA_ASSISTANT_MANAGER_PASSWORD;
});

async function accountControls(page: Page) {
  if (page.viewportSize()!.width <= 900) {
    await page.getByRole('button', { name: 'All Modules', exact: true }).click();
    return page.getByRole('dialog', { name: 'Mobile navigation' });
  }
  return page.locator('body');
}

for (const role of ['employee', 'general_manager', 'assistant_manager'] as const) {
  test(`${role} account controls persist theme and end the authenticated session`, async ({ page }) => {
    await login(page, role);
    const protectedPath = new URL(page.url()).pathname;
    const account = await accountControls(page);
    const colorful = account.getByRole('button', { name: 'Colorful Mode', exact: true });
    await expect(colorful).toBeVisible();
    if (page.viewportSize()!.width <= 900) {
      expect((await colorful.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await account.getByRole('button', { name: 'Sign out', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await colorful.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'colorful');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'colorful');
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.getByRole('button', { name: 'Colorful Mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize(test.info().project.use.viewport!);
    const restored = await accountControls(page);
    await restored.getByRole('button', { name: 'Standard Mode', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'standard');
    await restored.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    expect((await page.context().cookies()).filter(cookie => /sb-.*-auth-token/.test(cookie.name))).toHaveLength(0);
    await page.goBack();
    await expect(page.locator('.app-shell')).toHaveCount(0);
    await navigateAfterLogin(page, protectedPath);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByLabel('Password')).toBeVisible();
  });
}

test('long patient names wrap across tabs in both themes without hiding actions', async ({ page }) => {
  test.setTimeout(120_000);
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(process.env.BSMILE_QA_SUPABASE_URL!).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('Patient fixture requires QA');
  const db = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const auth = await fixtureLogin(() => db.auth.signInWithPassword(credentials('general_manager')), 'general_manager');
  if (auth.error || !auth.data.user) throw new Error('GM fixture unavailable');
  const name = 'Muhammad Abdul Rahman Alexander-Joseph ' + 'Chandrashekharan'.repeat(8);
  // Soft-deleted fixtures remain in the unique slug index but are hidden by RLS.
  // Keep the realistic display name constant; isolate each run's URL identity.
  const fixtureKey = crypto.randomUUID();
  const patient = await db.from('patients').insert({ full_name: name, slug: `qa-polish-${fixtureKey}`, patient_number: `POLISH-${fixtureKey}`, is_demo: true, source: 'Other', status: 'active', created_by: auth.data.user.id }).select('id,slug').single();
  if (patient.error) throw patient.error;
  try {
    await login(page, 'general_manager');
    for (const theme of ['Colorful Mode', 'Standard Mode']) {
      const account = await accountControls(page);
      await account.getByRole('button', { name: theme, exact: true }).click();
      if (page.viewportSize()!.width <= 900) await account.getByRole('button', { name: 'Close navigation', exact: true }).last().click();
      await navigateAfterLogin(page, `/admin/patients/${patient.data.slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
      await expect(page.getByRole('button', { name: 'Edit Client', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'More actions', exact: true })).toBeVisible();
      for (const tab of ['Overview', 'Appointments', 'Sessions', 'Documents', 'Notes', 'Activity']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await assertNoRawDatabaseError(page);
      }
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await test.info().attach(`long-name-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  } finally {
    const cleanup = await db.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', patient.data.id);
    if (cleanup.error) throw cleanup.error;
    await db.auth.signOut();
  }
});

test('colorful workspace surfaces remain readable and contained', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, 'general_manager');
  const account = await accountControls(page);
  await account.getByRole('button', { name: 'Colorful Mode', exact: true }).click();
  if (page.viewportSize()!.width <= 900) {
    await expect(account.locator('.mobile-account-controls')).toBeVisible();
    const colors = await account.locator('.mobile-launcher-header h2').evaluate(el => ({ text: getComputedStyle(el).color, background: getComputedStyle(el.closest('header')!).backgroundColor }));
    expect(colors).toEqual({ text: 'rgb(233, 237, 255)', background: 'rgb(17, 25, 54)' });
    await test.info().attach('mobile-colorful-account', { body: await page.screenshot(), contentType: 'image/png' });
    await account.getByRole('button', { name: 'Close navigation', exact: true }).last().click();
  }
  for (const route of ['/admin', '/admin/attendance', '/admin/tasks', '/admin/leaves', '/admin/chat', '/admin/daily-work']) {
    await navigateAfterLogin(page, route);
    await expect(page).toHaveURL(new RegExp(`${route}(?:[/?#]|$)`));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'colorful');
    if (route.endsWith('/chat')) await expect(page.getByRole('textbox', { name: /type a message/i })).toBeVisible();
    else await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await assertNoRawDatabaseError(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await test.info().attach(`colorful-${route.replaceAll('/', '-')}`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
});
