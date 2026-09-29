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
  if (!value) throw new Error(`Missing ${name} for local browser qualification.`);
}
const app = new URL(baseURL);
const api = new URL(supabaseUrl);
if (!['127.0.0.1', 'localhost'].includes(app.hostname) || app.port !== '3010') throw new Error('Refusing to test a non-local app.');
if (!['127.0.0.1', 'localhost'].includes(api.hostname) || api.port !== '54321') throw new Error('Refusing to use a non-local Supabase API.');

const fixture = JSON.parse(readFileSync(join(evidenceDir, 'browser-fixture.json'), 'utf8'));
const screenshotsDir = join(evidenceDir, 'screenshots');
mkdirSync(screenshotsDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], screenshots: [] };
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function pass(name, detail) {
  report.checks.push({ name, status: 'PASS', ...(detail ? { detail } : {}) });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

async function shot(page, name) {
  const path = join(screenshotsDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(path);
}

async function login(page, account, accountPassword = password, expected = /\/(?:admin|employee|clinician)(?:\/|$)/) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(expected, { timeout: 120_000 });
}

async function noRawDatabaseError(page) {
  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /could not embed|more than one relationship|row-level security|schema cache|postgrest|permission denied for (?:table|relation)|violates.*constraint|sqlstate/i);
}

async function ask(page, prompt, expected) {
  const composer = page.getByLabel('Ask a policy question or create a record');
  const assistants = page.locator('.genie-message-assistant');
  const previousCount = await assistants.count();
  await composer.fill(prompt);
  await page.getByRole('button', { name: 'Ask Genie' }).click();
  const response = assistants.nth(previousCount);
  await response.waitFor({ state: 'visible', timeout: 90_000 });
  assert.match(await response.innerText(), typeof expected === 'string' ? new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : expected);
  return response;
}

async function newContext(browser, viewport) {
  const context = await browser.newContext({ baseURL, viewport });
  context.on('page', page => {
    page.setDefaultTimeout(90_000);
    page.setDefaultNavigationTimeout(120_000);
  });
  return context;
}

const browser = await chromium.launch({ headless: true });
try {
  let desktop = await newContext(browser, { width: 1366, height: 768 });
  let page = await desktop.newPage();
  await login(page, fixture.users.gm);
  await page.evaluate(() => localStorage.setItem('bsmile-theme-mode', 'standard'));
  await page.goto('/admin/genie');
  await page.getByRole('heading', { name: 'Genie' }).waitFor();
  await ask(page, 'Hello!', 'Hello! How can I help?');
  pass('Genie deterministic greeting');

  const phone = `+97150${String(Date.now()).slice(-7)}`;
  await ask(page, `Add a lead named Noor Browser phone ${phone} from Website`, 'Reply “confirm” to save');
  await ask(page, 'confirm', 'Created lead');
  await shot(page, 'desktop-standard-genie-lead-created');
  pass('Genie lead created through authenticated browser');

  await ask(page, 'Create a task Prepare browser report due 2026-10-02 high priority', 'What assignee should I use?');
  const runId = fixture.users.gm.email.match(/^lqa-([^-]+)-/)?.[1];
  await ask(page, `LQA-${runId} gm`, 'Reply “confirm” to save');
  await ask(page, 'confirm', 'Created task');
  await shot(page, 'desktop-standard-genie-task-created');
  pass('Genie task created through authenticated browser');

  await ask(page, 'Record expense INR 500 for ad printing account Primary Bank category Marketing paid by UPI Digital Marketing Expenses', 'Reply “confirm” to save');
  await ask(page, 'confirm', 'Created expense');
  await shot(page, 'desktop-standard-genie-expense-created');
  pass('Genie expense created through authenticated browser');
  await noRawDatabaseError(page);

  await page.evaluate(() => localStorage.setItem('bsmile-theme-mode', 'colorful'));
  await page.reload();
  await page.getByRole('heading', { name: 'Genie' }).waitFor();
  await page.locator('html[data-theme="colorful"]').waitFor();
  await shot(page, 'desktop-colorful-genie');
  pass('desktop standard and colorful Genie themes');

  await desktop.close();
  desktop = await newContext(browser, { width: 1366, height: 768 });
  page = await desktop.newPage();
  await login(page, fixture.users.executive);

  await page.goto(`/admin/patients/${fixture.patient.slug}`);
  await page.getByRole('heading', { name: /LQA-.* Client/ }).waitFor();
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: 'Add Session' }).click();
  await page.getByLabel('Date & time').fill('2026-10-05T11:00');
  const practitioner = page.getByLabel('Practitioner');
  const psychologistOption = practitioner.locator('option').filter({ hasText: /psychologist/i }).last();
  await practitioner.selectOption(await psychologistOption.getAttribute('value'));
  await page.getByLabel('Status').selectOption('completed');
  await page.getByLabel('Session fee (INR)').fill('750');
  await page.getByLabel('Payment received now (INR)').fill('250');
  await page.getByLabel('Receiving account').selectOption({ label: 'Primary Bank' });
  await page.getByLabel('Payment method').selectOption('upi');
  await page.getByLabel('Payment reference').fill('LOCAL-BROWSER-QA');
  await page.getByLabel('Administrative summary').fill('Synthetic local browser qualification session');
  await page.getByRole('button', { name: 'Save session' }).click();
  await page.getByText('Saved successfully.').waitFor({ timeout: 30_000 });
  await page.getByText('Fee: INR 750.00 - Received: INR 250.00 - Outstanding: INR 500.00').first().waitFor();
  await shot(page, 'desktop-patient-session-history');
  pass('patient session and financial history through browser');

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByLabel('Reason').fill('Synthetic local browser archive qualification');
  await page.getByRole('button', { name: 'Review archive effects' }).click();
  await page.getByText('Review the effects below before confirming.').waitFor();
  const acknowledgement = page.getByText('I acknowledge that outstanding payments remain collectible.');
  if (await acknowledgement.count()) await acknowledgement.click();
  await page.getByRole('button', { name: 'Confirm archive' }).click();
  await page.getByText('Client archived. Linked history and financial records were preserved.').waitFor({ timeout: 30_000 });
  await page.getByText('Archived', { exact: true }).waitFor();
  await shot(page, 'desktop-patient-archived');
  pass('patient archived through browser with explicit balance acknowledgement');

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByLabel('Reason').fill('Synthetic local browser restore qualification');
  await page.getByRole('button', { name: 'Restore client' }).click();
  await page.getByText('Client restored with the same ID.').waitFor({ timeout: 30_000 });
  await page.locator('h1').getByText('Archived', { exact: true }).waitFor({ state: 'detached', timeout: 30_000 });
  await shot(page, 'desktop-patient-restored');
  pass('patient restored through browser with same route and identity');

  await page.goto(`/admin/doctor-scheduling?patient=${fixture.convertedPatient.id}`);
  await page.getByRole('heading', { name: 'Appointment & Scheduling' }).waitFor();
  await page.getByRole('button', { name: 'Appointments', exact: true }).click();
  const selectedClient = page.locator('.appointment-form select').first();
  await selectedClient.locator(`option[value="${fixture.convertedPatient.id}"]`).waitFor({ state: 'attached', timeout: 30_000 });
  assert.equal(await selectedClient.inputValue(), fixture.convertedPatient.id);
  await shot(page, 'desktop-converted-client-appointment-selection');
  pass('converted client appears preselected in appointment creation');

  const teamsContext = await newContext(browser, { width: 1366, height: 768 });
  const teamsPage = await teamsContext.newPage();
  await login(teamsPage, fixture.users.employee);
  await teamsPage.goto('/employee/chat');
  await teamsPage.locator('.chat-hub').waitFor({ timeout: 90_000 });
  await teamsPage.getByRole('heading', { name: 'Messages' }).waitFor();
  await noRawDatabaseError(teamsPage);
  await shot(teamsPage, 'desktop-teams-regression');
  await teamsContext.close();
  pass('Teams page authenticated regression smoke');

  await page.goto('/admin');
  await page.locator('.app-shell').waitFor();
  await page.getByText('Loading live company data…').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  await noRawDatabaseError(page);
  await shot(page, 'desktop-dashboard-regression');
  pass('dashboard live-count regression smoke');
  await desktop.close();

  for (const width of [375, 390, 430]) {
    for (const theme of ['standard', 'colorful']) {
      const context = await newContext(browser, { width, height: 844 });
      const mobile = await context.newPage();
      await login(mobile, fixture.users.employee);
      await mobile.evaluate(value => localStorage.setItem('bsmile-theme-mode', value), theme);
      await mobile.goto('/employee/genie');
      await mobile.getByRole('heading', { name: 'Genie' }).waitFor();
      await ask(mobile, 'Hello!', 'Hello! How can I help?');
      await mobile.locator(`html[data-theme="${theme}"]`).waitFor();
      assert((await mobile.evaluate(() => document.documentElement.scrollWidth)) <= width);
      await mobile.locator('.genie-composer').waitFor();
      const messages = await mobile.locator('.genie-message').allTextContents();
      assert.match(messages.at(-2) || '', /You.*Hello!/s);
      assert.match(messages.at(-1) || '', /Genie.*Hello! How can I help\?/s);
      const distance = await mobile.locator('.genie-thread').evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight);
      assert(distance <= 2, `Genie thread did not auto-scroll at ${width}px ${theme}.`);
      await shot(mobile, `mobile-${width}-${theme}-genie`);
      await noRawDatabaseError(mobile);
      await context.close();
      pass(`mobile Genie ${width}px ${theme}`);
    }
  }

  const onboardingAccount = fixture.users.onboarding;
  const prepared = await service.from('profiles').update({ onboarding_required: true, onboarding_completed_at: null }).eq('id', onboardingAccount.id);
  if (prepared.error) throw prepared.error;
  const onboardingContext = await newContext(browser, { width: 390, height: 844 });
  const onboardingPage = await onboardingContext.newPage();
  const completedPassword = `${password}-completed`;
  const privatePassword = `${password}-browser-private`;
  await login(onboardingPage, onboardingAccount, completedPassword, /\/onboarding\/password/);
  await onboardingPage.getByRole('heading', { name: 'Create your private password' }).waitFor();
  await shot(onboardingPage, 'mobile-onboarding-password-gate');
  await onboardingPage.getByLabel('New password', { exact: true }).fill(privatePassword);
  await onboardingPage.getByLabel('Confirm new password', { exact: true }).fill(privatePassword);
  await onboardingPage.getByRole('button', { name: 'Change password and continue' }).click();
  await onboardingPage.waitForURL(url => !url.pathname.startsWith('/onboarding'), { timeout: 30_000 });
  const verified = await service.from('profiles').select('onboarding_required,onboarding_completed_at').eq('id', onboardingAccount.id).single();
  if (verified.error) throw verified.error;
  assert.equal(verified.data.onboarding_required, false);
  assert(verified.data.onboarding_completed_at);
  await service.auth.admin.updateUserById(onboardingAccount.id, { password: completedPassword });
  await onboardingContext.close();
  pass('real browser onboarding gate and completion');

  report.finishedAt = new Date().toISOString();
  writeFileSync(join(evidenceDir, 'browser-qualification-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`RESULT ${report.checks.length} browser checks passed`);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.failure = error instanceof Error ? error.message : String(error);
  writeFileSync(join(evidenceDir, 'browser-qualification-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`FAIL ${report.failure}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
