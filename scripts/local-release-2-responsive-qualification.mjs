import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const baseURL = process.env.BSMILE_QA_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.BSMILE_LOCAL_QA_PASSWORD;
const evidenceDir = process.env.BSMILE_LOCAL_QA_EVIDENCE_DIR;
for (const [name, value] of Object.entries({ baseURL, supabaseUrl, anonKey, serviceKey, password, evidenceDir })) {
  if (!value) throw new Error(`Missing ${name} for responsive qualification.`);
}
const app = new URL(baseURL);
const api = new URL(supabaseUrl);
if (!['127.0.0.1', 'localhost'].includes(app.hostname) || app.port !== '3010') throw new Error('Refusing to test a non-local app.');
if (!['127.0.0.1', 'localhost'].includes(api.hostname) || api.port !== '54321') throw new Error('Refusing to use a non-local Supabase API.');

const fixture = JSON.parse(readFileSync(join(evidenceDir, 'browser-fixture.json'), 'utf8'));
const screenshotsDir = join(evidenceDir, 'screenshots', 'release-2-responsive');
mkdirSync(screenshotsDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], screenshots: [] };
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const viewports = [
  { name: 'desktop-1366', width: 1366, height: 768 },
  { name: 'desktop-1536', width: 1536, height: 864 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
];

function pass(name, detail) {
  report.checks.push({ name, status: 'PASS', ...(detail ? { detail } : {}) });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(page, account, accountPassword = password, expected = /\/(?:admin|employee|clinician)(?:\/|$)/) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(expected, { timeout: 120_000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(dimensions.scrollWidth <= dimensions.width, `${label} overflowed horizontally: ${dimensions.scrollWidth} > ${dimensions.width}`);
}

async function shot(page, name) {
  const path = join(screenshotsDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(path);
}

const browser = await chromium.launch({ headless: true });
try {
  const clearedDrafts = await service.from('genie_workflow_drafts')
    .update({ status: 'cancelled', confirmation_token: null })
    .eq('actor_id', fixture.users.executive.id)
    .in('status', ['draft', 'awaiting_confirmation']);
  if (clearedDrafts.error) throw clearedDrafts.error;
  for (const viewport of viewports) {
    for (const theme of ['standard', 'colorful']) {
      const context = await browser.newContext({ baseURL, viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      page.setDefaultTimeout(90_000);
      await login(page, fixture.users.executive);
      await page.evaluate(value => localStorage.setItem('bsmile-theme-mode', value), theme);

      await page.goto('/admin/genie');
      await page.getByRole('heading', { name: 'Genie' }).waitFor();
      await page.locator(`html[data-theme="${theme}"]`).waitFor();
      const composer = page.getByLabel('Ask a policy question or create a record');
      const phone = `+97150${String(Date.now()).slice(-7)}`;
      await composer.fill(`Hi, I need to add a lead named Noor Responsive phone ${phone} from Website`);
      await page.getByRole('button', { name: 'Ask Genie' }).click();
      await page.getByText('Reply “confirm” to save', { exact: false }).waitFor();
      await assertNoHorizontalOverflow(page, `${viewport.name} ${theme} Genie confirmation`);
      const threadDistance = await page.locator('.genie-thread').evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight);
      assert(threadDistance <= 2, `${viewport.name} ${theme} Genie did not retain latest-message scroll.`);
      await page.getByLabel('Ask a policy question or create a record').fill('cancel');
      await page.getByRole('button', { name: 'Ask Genie' }).click();
      await page.getByText(/cancelled/i).last().waitFor();
      await shot(page, `${viewport.name}-${theme}-genie-action`);

      await page.goto(`/admin/patients/${fixture.patient.slug}`);
      await page.getByRole('button', { name: 'Sessions', exact: true }).click();
      await page.getByRole('button', { name: 'Add Session' }).click();
      await page.getByLabel('Session fee (INR)').waitFor();
      await assertNoHorizontalOverflow(page, `${viewport.name} ${theme} Add Session`);
      if ((viewport.width === 390 && theme === 'standard') || (viewport.width === 1536 && theme === 'colorful')) {
        await shot(page, `${viewport.name}-${theme}-add-session`);
      }
      await page.getByRole('button', { name: 'Add Session' }).click();
      await page.getByRole('button', { name: 'More actions' }).click();
      await page.getByLabel('Reason').fill('Responsive local qualification review');
      await page.getByRole('button', { name: 'Review archive effects' }).click();
      await page.getByText('Review the effects below before confirming.').waitFor();
      await assertNoHorizontalOverflow(page, `${viewport.name} ${theme} archive confirmation`);

      await page.goto('/admin/employees/new');
      await page.getByRole('textbox', { name: /^Work email/ }).waitFor();
      await page.getByRole('textbox', { name: /^Login email/ }).waitFor();
      await assertNoHorizontalOverflow(page, `${viewport.name} ${theme} employee login email`);

      await page.goto(`/admin/doctor-scheduling?patient=${fixture.convertedPatient.id}`);
      await page.getByRole('heading', { name: 'Appointment & Scheduling' }).waitFor();
      await page.getByRole('button', { name: 'Appointments', exact: true }).click();
      await page.getByLabel('Search clients').fill(fixture.convertedPatient.patientNumber);
      const selectedClient = page.locator('.appointment-form select').first();
      await selectedClient.locator(`option[value="${fixture.convertedPatient.id}"]`).waitFor({ state: 'attached' });
      assert.equal(await selectedClient.inputValue(), fixture.convertedPatient.id);
      await assertNoHorizontalOverflow(page, `${viewport.name} ${theme} appointment selector`);
      await context.close();

      const prepared = await service.from('profiles').update({ onboarding_required: true, onboarding_completed_at: null }).eq('id', fixture.users.onboarding.id);
      if (prepared.error) throw prepared.error;
      const onboardingContext = await browser.newContext({ baseURL, viewport: { width: viewport.width, height: viewport.height } });
      const onboardingPage = await onboardingContext.newPage();
      await login(onboardingPage, fixture.users.onboarding, `${password}-completed`, /\/onboarding\/password/);
      await onboardingPage.getByRole('heading', { name: 'Create your private password' }).waitFor();
      await assertNoHorizontalOverflow(onboardingPage, `${viewport.name} ${theme} onboarding`);
      await onboardingContext.close();
      const restored = await service.from('profiles').update({ onboarding_required: false, onboarding_completed_at: new Date().toISOString() }).eq('id', fixture.users.onboarding.id);
      if (restored.error) throw restored.error;

      pass(`${viewport.name} ${theme} responsive workflow matrix`);
    }
  }

  report.finishedAt = new Date().toISOString();
  writeFileSync(join(evidenceDir, 'release-2-responsive-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`RESULT ${report.checks.length} responsive matrices passed`);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(join(evidenceDir, 'release-2-responsive-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`FAIL ${report.failure}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
