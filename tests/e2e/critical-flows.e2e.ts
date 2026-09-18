import { expect, test } from '@playwright/test';
import { assertNoRawDatabaseError, login, navigateAfterLogin, QaRole } from './helpers';
import { createClient } from '@supabase/supabase-js';
import { credentials } from './helpers';
import { fixtureLogin } from './fixture-auth';
import { defaultCrmLeadDate } from '../../src/lib/crm-lead-date';
import { readFileSync } from 'node:fs';

async function cleanupQaMeeting(marker: string) {
  const state = JSON.parse(readFileSync('release-evidence/auth-state/general_manager.json', 'utf8')) as { cookies?: Array<{ name?: string; value?: string }> };
  const cookie = state.cookies?.find(item => item.name === `sb-${process.env.BSMILE_QA_PROJECT_REF}-auth-token` && typeof item.value === 'string');
  if (!cookie?.value) throw new Error('General Manager auth state unavailable for deterministic Meeting cleanup');
  const encoded = cookie.value.replace(/^base64-/, '');
  const session = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as { access_token?: string; refresh_token?: string };
  if (!session.access_token || !session.refresh_token) throw new Error('General Manager auth state is missing a session');
  const db = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await db.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (auth.error) throw auth.error;
  const found = await db.from('meetings').select('id,status').eq('title', marker);
  if (found.error) throw found.error;
  for (const meeting of found.data || []) {
    if (meeting.status !== 'cancelled') {
      const cancelled = await db.rpc('cancel_meeting', { target_meeting: meeting.id, cancel_reason: 'Release gate lifecycle complete' });
      if (cancelled.error) throw cancelled.error;
    }
  }
  const remaining = await db.from('meetings').select('id,status').eq('title', marker).neq('status', 'cancelled');
  if (remaining.error) throw remaining.error;
  if ((remaining.data || []).length) throw new Error(`Meeting cleanup did not settle for ${marker}`);
}

for (const customDate of [false, true]) {
  test(`admin ${customDate ? 'chooses' : 'defaults'} Lead Date on create and edits it without changing creation time`, async ({ page }) => {
    test.setTimeout(90_000);
    if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe'
      || new URL(process.env.BSMILE_QA_SUPABASE_URL!).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('Lead Date fixtures require QA');
    const db = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = await fixtureLogin(() => db.auth.signInWithPassword(credentials('admin')), 'admin');
    if (auth.error || !auth.data.user) throw new Error('Lead Date role fixture unavailable');
    const marker = `QA_LEAD_DATE_${crypto.randomUUID()}`;
    const phone = String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
    let leadId: string | undefined;
    try {
      await login(page, 'admin');
      await navigateAfterLogin(page, '/admin/crm/leads');
      await expect(page.locator('.module-skeleton-row, .module-mobile-skeleton')).toHaveCount(0);
      await page.getByRole('button', { name: 'Add lead', exact: true }).click();
      const createForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add lead' }) });
      await expect(createForm).toBeVisible();
      const date = createForm.getByLabel('Lead Date');
      await expect(date).toHaveValue(defaultCrmLeadDate());
      const chosenDate = customDate ? '2026-08-21' : defaultCrmLeadDate();
      if (customDate) await date.fill(chosenDate);
      await createForm.getByLabel('Full name').fill(marker);
      await createForm.getByLabel('Phone number').fill(phone);
      await createForm.getByRole('button', { name: 'Add lead', exact: true }).click();
      await expect(createForm).toHaveCount(0);
      const stored = await db.from('crm_leads').select('id,lead_date,created_at').eq('full_name', marker).single();
      if (stored.error) throw stored.error;
      leadId = stored.data.id;
      expect(stored.data.lead_date).toBe(chosenDate);
      const createdAt = stored.data.created_at;
      await navigateAfterLogin(page, `/admin/crm/leads/${leadId}`);
      const editDate = page.locator('input[name="lead_date"]');
      await expect(editDate).toHaveValue(chosenDate);
      await editDate.fill('2026-08-20');
      await page.getByRole('button', { name: 'Save lead' }).click();
      await expect(page.getByText('Lead details saved.')).toBeVisible();
      await page.reload();
      await expect(page.locator('input[name="lead_date"]')).toHaveValue('2026-08-20');
      const edited = await db.from('crm_leads').select('lead_date,created_at').eq('id', leadId).single();
      if (edited.error) throw edited.error;
      expect(edited.data.lead_date).toBe('2026-08-20');
      expect(edited.data.created_at).toBe(createdAt);
      await assertNoRawDatabaseError(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } finally {
      if (leadId) {
        const cleanup = await db.rpc('archive_crm_lead', { target_lead: leadId });
        if (cleanup.error) throw cleanup.error;
      }
      await db.auth.signOut();
    }
  });
}

for (const role of ['admin', 'general_manager'] as const) {
  test(`${role} archives a lead through the UI without exposing database errors`, async ({ page }) => {
    test.setTimeout(90_000);
    if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(process.env.BSMILE_QA_SUPABASE_URL!).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('Archive fixtures require QA');
    const db = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, {auth: {persistSession: false, autoRefreshToken: false}});
    const auth = await fixtureLogin(() => db.auth.signInWithPassword(credentials(role)), role);
    if (auth.error || !auth.data.user) throw new Error('Archive role fixture unavailable');
    const id = crypto.randomUUID();
    const marker = `RELEASE_GATE_ARCHIVE_BROWSER_${id}`;
    const fixture = await db.from('crm_leads').insert({id, full_name: marker, phone: '0000000000', assigned_to: auth.data.user.id, created_by: auth.data.user.id});
    if (fixture.error) throw fixture.error;
    try {
      await login(page, role);
      await navigateAfterLogin(page, '/admin/crm/leads');
      const all = page.getByRole('tab', {name: /^All \d+$/});
      await expect(all).toBeVisible();
      // The tab exists with a zero count during initial loading. Wait for the
      // canonical list to finish before comparing the post-archive population.
      await expect(page.locator('.module-skeleton-row, .module-mobile-skeleton')).toHaveCount(0);
      const before = Number((await all.innerText()).match(/\d+/)![0]);
      expect(before).toBeGreaterThan(0);
      await page.getByRole('searchbox', {name: 'Search leads'}).fill(marker);
      // Desktop uses a table/Open link; mobile uses a card/Open lead link.
      // Both must open this exact fixture through the visible UI control.
      await page.locator(`a[href="/admin/crm/leads/${id}"]:visible`).click();
      await expect(page.getByRole('heading', {name: marker, exact: true})).toBeVisible();
      // Exercise the failure path without sending a failing mutation to the DB.
      const rpc = '**/rest/v1/rpc/archive_crm_lead';
      await page.route(rpc, route => route.fulfill({status: 403, contentType: 'application/json', body: JSON.stringify({code:'42501',message:'new row violates row-level security policy for table "crm_leads"'})}));
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', {name: 'Archive lead', exact: true}).click();
      await expect(page.getByText("We couldn't archive the lead. Please try again.", {exact: true})).toBeVisible();
      await assertNoRawDatabaseError(page);
      const stillLive = await db.from('crm_leads').select('id').eq('id', id).single();
      expect(stillLive.error).toBeNull();
      await page.unroute(rpc);
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', {name: 'Archive lead', exact: true}).click();
      await expect(page).toHaveURL(/\/admin\/crm$/);
      await navigateAfterLogin(page, '/admin/crm/leads');
      await expect(page.getByRole('tab', {name: `All ${before - 1}`, exact: true})).toBeVisible();
      await page.getByRole('searchbox', {name: 'Search leads'}).fill(marker);
      await expect(page.locator(`a[href="/admin/crm/leads/${id}"]`)).toHaveCount(0);
      await assertNoRawDatabaseError(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await navigateAfterLogin(page, '/admin');
      await expect(page.getByRole('link').filter({hasText: /Active leads/i}).first()).toBeVisible();
      await assertNoRawDatabaseError(page);
    } finally {
      // The browser context removes route mocks on teardown. Database fixture
      // cleanup must still run when a failed test has already closed the page.
      const remaining = await db.from('crm_leads').select('id').eq('id', id);
      if (remaining.error) throw remaining.error;
      if (remaining.data.length) {
        const cleanup = await db.rpc('archive_crm_lead', {target_lead: id});
        if (cleanup.error) throw cleanup.error;
      }
      await db.auth.signOut();
    }
  });
}

test('authorized patient upload finalizes and downloads through the application', async ({ page }) => {
  test.setTimeout(90_000);
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe') throw new Error('QA only');
  const db = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const auth = await fixtureLogin(() => db.auth.signInWithPassword(credentials('general_manager')), 'general_manager');
  if (auth.error || !auth.data.user) throw new Error('GM fixture unavailable');
  const marker = `D2_BROWSER_${Date.now()}`;
  const patient = await db.from('patients').insert({patient_number:marker,full_name:marker,status:'active',source:'Other',is_demo:true,created_by:auth.data.user.id}).select('id,slug').single();
  if (patient.error) throw patient.error;
  let documentId: string | undefined;
  try {
    await login(page, 'general_manager');
    const response = await page.request.post(`/api/patients/${patient.data.id}/documents/upload`, { multipart: {
      documentName:marker, category:'Other', visibility:'general_staff',
      file:{name:'qa.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=','base64')},
    }});
    expect(response.status()).toBe(201);
    documentId = (await response.json()).id;
    const stored = await db.from('patient_documents').select('storage_key,uploaded_by,checksum').eq('id',documentId!).single();
    if (stored.error) throw stored.error;
    expect(stored.data.storage_key).toContain(`patients/${patient.data.id}/documents/${documentId}/`);
    expect(stored.data.uploaded_by).toBe(auth.data.user.id);
    expect(stored.data.checksum).toHaveLength(64);
    await navigateAfterLogin(page, `/admin/patients/${patient.data.slug}`);
    await page.getByRole('button',{name:'Documents',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Documents',exact:true})).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button',{name:'Download document',exact:true}).click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe('qa.png');
    await assertNoRawDatabaseError(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally {
    if (documentId) {
      const result = await db.from('patient_documents').update({status:'archived',updated_by:auth.data.user.id}).eq('id',documentId);
      if (result.error) throw result.error;
    }
    const cleanup = await db.from('patients').update({deleted_at:new Date().toISOString()}).eq('id',patient.data.id);
    if (cleanup.error) throw cleanup.error;
    await db.auth.signOut();
  }
});

for (const role of ['general_manager', 'employee'] as const) {
  for (const surface of ['meetings', 'calendar'] as const) {
    test(`${role} loads ${surface} with participant relationships`, async ({ page }) => {
      await login(page, role);
      const response = page.waitForResponse(r => r.url().includes('/rest/v1/meetings?') && r.request().method() === 'GET');
      await navigateAfterLogin(page, `/${role === 'employee' ? 'employee' : 'admin'}/${surface}`);
      expect((await response).ok()).toBe(true);
      await expect(page.getByRole('heading', { name: surface === 'calendar' ? 'My Calendar' : 'Meetings', exact: true })).toBeVisible();
      if (surface === 'meetings') await expect(page.getByRole('tabpanel')).toBeVisible();
      else await expect(page.getByRole('region', { name: 'Month calendar' })).toBeVisible();
      await expect(page.locator('.dashboard-error')).toHaveCount(0);
      await assertNoRawDatabaseError(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}

const roleLandings: Array<[QaRole, RegExp]> = [['admin', /admin/], ['general_manager', /admin/], ['manager', /admin|employee/], ['employee', /employee/]];
test('meeting create, participant detail, edit and calendar remain connected', async ({ page, browser }) => {
  test.setTimeout(120_000);
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe') throw new Error('Meeting write fixture requires QA');
  await login(page, 'general_manager');
  await navigateAfterLogin(page, '/admin/meetings');
  const marker = `RELEASE_GATE_MEETING_${Date.now()}`;
  await page.getByRole('button', { name: 'Create Meeting', exact: false }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Meeting title').fill(marker);
  await dialog.getByLabel('Agenda', { exact: true }).fill('QA lifecycle agenda');
  await dialog.getByRole('combobox', { name: 'Host', exact: true }).selectOption({ label: 'QA General Manager' });
  const date = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
  await dialog.getByLabel('Date', { exact: true }).fill(date);
  const startMinutes = 180 + (Date.now() % 540);
  const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  await dialog.getByLabel('Start time').fill(formatTime(startMinutes));
  await dialog.getByLabel('End time').fill(formatTime(startMinutes + 10));
  const participant = dialog.locator('.people label').filter({ hasText: 'QA Employee' }).first();
  await participant.getByRole('checkbox').check();
  const participantName = await participant.locator('b').innerText();
  const createResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/save_meeting') && response.request().method() === 'POST' && response.status() === 200);
  await dialog.getByRole('button', { name: 'Create Meeting', exact: true }).click();
  await createResponse;
  await expect(page.getByRole('button').filter({ hasText: marker })).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  try {
    await page.getByRole('button').filter({ hasText: marker }).click();
    await expect(page.getByRole('dialog').locator('.meeting-detail-row').filter({ hasText: 'Participants' })).toContainText(participantName);
    await expect(dialog.locator('.meeting-detail-row').filter({ hasText: 'Host' })).toContainText('QA General Manager');
    await expect(dialog.locator('.meeting-detail-row').filter({ hasText: 'Agenda' })).toContainText('QA lifecycle agenda');
    // Own the nested session's context explicitly. browser.newPage() creates an
    // implicit disposable context; under the shared auth-state/reporter setup
    // that context can outlive the parent page fixture and race fixture teardown.
    const employeeContext = await browser.newContext({
      viewport: page.viewportSize()!,
      storageState: 'release-evidence/auth-state/employee.json',
    });
    const employee = await employeeContext.newPage();
    try {
      await navigateAfterLogin(employee, '/employee/meetings');
      await employee.getByRole('button').filter({ hasText: marker }).click();
      await expect(employee.getByRole('dialog')).toContainText('QA lifecycle agenda');
      await expect(employee.getByRole('button', { name: 'Edit Meeting', exact: true })).toHaveCount(0);
      await expect(employee.getByRole('button', { name: 'Cancel Meeting', exact: true })).toHaveCount(0);
      await assertNoRawDatabaseError(employee);
    } finally { await employeeContext.close(); }
    await page.getByRole('button', { name: 'Edit Meeting', exact: true }).click();
    await dialog.getByLabel('Agenda').fill('QA edit preserves participants');
    const saveChanges = dialog.getByRole('button', { name: 'Save Changes', exact: true });
    await expect(saveChanges).toBeEnabled({ timeout: 30_000 });
    await saveChanges.scrollIntoViewIfNeeded();
    const editResponse = page.waitForResponse((response) => response.url().includes('/rest/v1/rpc/save_meeting') && response.request().method() === 'POST' && response.ok());
    await saveChanges.click();
    await editResponse;
    await expect(dialog).toHaveCount(0);
    await navigateAfterLogin(page, '/admin/calendar');
    await expect(page.getByRole('region', { name: 'Month calendar' })).toBeVisible({ timeout: 30_000 });
    await assertNoRawDatabaseError(page);
    await navigateAfterLogin(page, '/admin/meetings');
    await page.getByRole('button').filter({ hasText: marker }).click();
    await page.getByRole('button', { name: 'Cancel Meeting', exact: true }).click();
    await page.getByLabel('Cancellation reason').fill('Release gate lifecycle complete');
    const cancelResponse = page.waitForResponse((response) => response.url().includes('/rest/v1/rpc/cancel_meeting') && response.request().method() === 'POST' && response.ok());
    await page.getByRole('button', { name: 'Confirm cancellation' }).click();
    await cancelResponse;
    await expect(page.getByText('Cancelling...', { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 });
    await page.getByRole('tab', { name: /Cancelled/ }).click();
    await page.getByRole('button').filter({ hasText: marker }).click();
    await expect(page.getByRole('dialog')).toContainText('Release gate lifecycle complete');
    await expect(page.getByRole('dialog')).toContainText('QA edit preserves participants');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await cleanupQaMeeting(marker);
  }
});
for (const [role, landing] of roleLandings) test(`${role} login`, async ({ page }) => { await login(page, role); await expect(page).toHaveURL(landing); await assertNoRawDatabaseError(page); });

test('general manager task creation, assignment, detail and edit', async ({ page }) => {
  await login(page, 'general_manager'); await page.goto('/admin/tasks');
  const marker = `E2E task ${Date.now()}`; await page.getByRole('button', { name: /create new task/i }).click();
  await page.getByRole('textbox', { name: /^task title$/i }).fill(marker); await page.getByRole('textbox', { name: /^description$/i }).fill('Release-gate task; safe to delete.');
  await page.getByRole('textbox', { name: /^due date$/i }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.getByRole('textbox', { name: /search employees/i }).fill('QA Employee');
  await page.getByRole('button', { name: /Quality Assurance Operations Specialist$/i }).click();
  await page.getByRole('button', { name: /create task/i }).click();
  const taskCard = page.getByRole('article').filter({ hasText: marker }).first(); await expect(taskCard).toBeVisible();
  if (page.viewportSize()!.width < 768) await taskCard.getByRole('button').first().click();
  else { await page.getByLabel(`Actions for ${marker}`).last().click(); await page.getByRole('button', { name: /view details/i }).click(); }
  await expect(page.getByText(/task owner/i)).toBeVisible(); await expect(page.getByText(/completion sla/i)).toBeVisible();
  await assertNoRawDatabaseError(page);
});

test('task navigation uses durable filters', async ({ page }) => { await login(page, 'general_manager'); await page.goto('/admin/tasks'); await page.getByRole('button', { name: /show overdue/i }).click(); await expect(page).toHaveURL(/view=overdue/); await page.goBack(); await page.getByRole('button', { name: /show high priority tasks/i }).click(); await expect(page).toHaveURL(/priority=high/); await page.reload(); await expect(page).toHaveURL(/priority=high/); });

for (const [route, heading] of [['/admin/leaves', /leave/i], ['/admin/attendance', /attendance/i], ['/admin/daily-work', /daily work/i], ['/admin/employees', /employee/i], ['/admin/reports', /report/i]] as const) {
  test(`management loads ${route}`, async ({ page }) => { await login(page, 'general_manager'); await navigateAfterLogin(page, route); await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible(); await assertNoRawDatabaseError(page); });
}
test('management loads Teams', async ({ page }) => { await login(page, 'general_manager'); await page.goto('/admin/chat'); await expect(page.getByRole('textbox', { name: /type a message/i })).toBeVisible({ timeout: 30_000 }); await expect(page.getByRole('button', { name: /record voice message/i })).toBeVisible(); await assertNoRawDatabaseError(page); });

test('employee critical workspace surfaces', async ({ page }) => {
  await login(page, 'employee');
  for (const route of ['/employee/leaves', '/employee/attendance', '/employee/daily-work', '/employee/chat', '/employee/profile']) {
    await navigateAfterLogin(page, route);
    await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}(?:[/?#]|$)`));
    await expect(page.locator('main:visible, section:visible').first()).toBeVisible();
    await assertNoRawDatabaseError(page);
  }
  await navigateAfterLogin(page, '/employee/chat');
  await expect(page).toHaveURL(/\/employee\/chat(?:[/?#]|$)/);
  await expect(page.getByRole('button', { name: /voice|record/i }).first()).toBeVisible();
});
test('employee denied management modules', async ({ page }) => { await login(page, 'employee'); for (const route of ['/admin/tasks', '/admin/reports']) { await page.goto(route); await expect(page).toHaveURL(/unauthorized|employee/); } });

test('employee submits Daily Work and manager can review it', async ({ page, browser }) => {
  const marker = `Release gate work ${Date.now()}`; await login(page, 'employee'); await navigateAfterLogin(page, '/employee/daily-work'); const summary = page.getByLabel('Work summary'); const saveButton = page.getByRole('button', { name: /save summary|update summary/i }); await expect(saveButton).toBeEnabled(); await summary.fill(marker);
  const saved = page.waitForResponse(response => response.url().includes('/daily_work_updates') && response.request().method() !== 'GET');
  await saveButton.click(); const savedResponse = await saved; expect(savedResponse.ok()).toBe(true); await expect(summary).toHaveValue(marker); await expect(page.getByText(/saved/i)).toBeVisible();
  const managerContext = await browser.newContext();
  const manager = await managerContext.newPage();
  try { await login(manager, 'general_manager'); await navigateAfterLogin(manager, '/admin/daily-work'); await manager.getByRole('textbox', { name: /^search$/i }).fill(marker); await expect(manager.getByText(marker)).toBeVisible(); }
  finally { await managerContext.close(); }
});

test('attendance Excel export downloads a workbook', async ({ page }) => { await login(page, 'general_manager'); await page.goto('/admin/attendance'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: /export excel/i }).click(); expect((await download).suggestedFilename()).toMatch(/\.xlsx$/i); });

test('employee can submit leave and cannot review leave', async ({ page }) => {
  await login(page, 'employee');
  const leaveLink = page.getByRole('link', { name: 'Apply for leave', exact: true });
  await expect(leaveLink).toHaveAttribute('href', '/employee/leaves');
  await leaveLink.click();
  await expect(page).toHaveURL(/\/employee\/leaves$/);
  await expect(page.getByRole('button', { name: /submit request/i })).toBeVisible({ timeout: 30_000 });
  // Also prove the cookie-backed session survives a real document navigation.
  await page.reload();
  await expect(page).toHaveURL(/\/employee\/leaves$/);
  await expect(page.getByRole('button', { name: /submit request/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /approve|reject/i })).toHaveCount(0);
  await assertNoRawDatabaseError(page);
});
test('authorized manager has leave review controls when a pending request exists', async ({ page }) => { await login(page, 'general_manager'); await navigateAfterLogin(page, '/admin/leaves'); const pending = page.getByText('Pending').first(); await expect(pending).toBeVisible(); if (await page.getByRole('button', { name: /approve/i }).count()) { await expect(page.getByRole('button', { name: /reject/i }).first()).toBeVisible(); } });

test('Teams supports messages, images, voice surface and safe group authorization', async ({ page }) => { await login(page, 'employee'); await page.goto('/employee/chat'); const composer = page.getByRole('textbox', { name: /type a message/i }); await expect(composer).toBeVisible(); await composer.fill(`Release gate message ${Date.now()}`); await composer.locator('xpath=..').getByRole('button').last().click(); await expect(page.getByRole('button', { name: /voice|record/i }).first()).toBeVisible(); await expect(page.getByRole('menuitem', { name: /delete group/i })).toHaveCount(0); await assertNoRawDatabaseError(page); });

test('employee task completion requires an update', async ({ page }) => { await login(page, 'employee'); await navigateAfterLogin(page, '/employee/tasks'); const completed = page.getByRole('button', { name: /complete/i }).first(); if (await completed.count()) { await completed.click(); await expect(page.getByRole('button', { name: /complete task/i })).toBeDisabled(); await page.getByLabel(/completion update/i).fill('Completed during automated release verification.'); await expect(page.getByRole('button', { name: /complete task/i })).toBeEnabled(); } });
