import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseURL = process.env.BSMILE_QA_BASE_URL;
const email = process.env.BSMILE_QA_ADMIN_EMAIL;
const password = process.env.BSMILE_QA_ADMIN_PASSWORD;
if (!baseURL || !email || !password) throw new Error('QA URL and Admin credentials are required');
const browser = await chromium.launch();
const result = { createPayloadCategory: null, editPayloadCategory: null, qaDatabaseWrites: 0 };
try {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/sign-in', { timeout: 90000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 90000 });
  await page.goto('/admin/crm/leads');
  await page.locator('.module-skeleton-row').first().waitFor({ state: 'hidden', timeout: 30000 });
  const pageError = await page.locator('.crm-leads-workspace > [role="alert"]').textContent().catch(() => null);
  if (pageError) throw new Error(`CRM QA load failed: ${pageError}`);
  await page.getByRole('button', { name: 'Add lead' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add lead' });
  await dialog.getByLabel('Full name').fill('QA Category Browser Test');
  await dialog.getByLabel('Phone number').fill('9999999999');
  await dialog.getByLabel('Category').selectOption('Child');
  await page.route('**/rest/v1/crm_leads?*', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON();
    result.createPayloadCategory = Array.isArray(body) ? body[0]?.category : body?.category;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000002' }) });
  });
  await dialog.getByRole('button', { name: 'Add lead', exact: true }).click();
  try { await page.getByText('Lead added and assigned successfully.').waitFor({ timeout: 15000 }); }
  catch (error) { throw new Error(`Lead create feedback: ${await dialog.textContent()}`, { cause: error }); }
  if (result.createPayloadCategory !== 'Child') throw new Error(`Create did not send Child: ${result.createPayloadCategory}`);

  const existingLead = page.locator('a[href^="/admin/crm/leads/"]').first();
  const href = await existingLead.getAttribute('href');
  if (!href) throw new Error('No QA lead available for edit UI check');
  await page.goto(href);
  await page.getByRole('button', { name: 'Save lead' }).waitFor({ timeout: 30000 });
  await page.locator('select[name="category"]').selectOption('Adults');
  await page.route('**/rest/v1/crm_leads?*', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const body = route.request().postDataJSON();
    result.editPayloadCategory = body.category;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000002' }) });
  });
  await page.getByRole('button', { name: 'Save lead' }).click();
  await page.getByText('Lead details saved.').waitFor({ timeout: 15000 });
  if (result.editPayloadCategory !== 'Adults') throw new Error(`Edit did not send Adults: ${result.editPayloadCategory}`);
  writeFileSync(join(process.cwd(), 'qa-artifacts', 'client-followup-screenshots', 'lead-category-ui-verification.json'), JSON.stringify(result, null, 2));
  await context.close();
} finally { await browser.close(); }
