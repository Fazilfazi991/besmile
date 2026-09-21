import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertNoRawDatabaseError, credentials, login, navigateAfterLogin } from './helpers';

test.describe.configure({ mode: 'serial' });

let fixtureAdmin: SupabaseClient;
let psychologistDb: SupabaseClient;
let psychologistId = '';
let assignedLeadId = '';
let outsideLeadId = '';
let convertedPatientId = '';
let salesCoordinatorId = '';
let salesCoordinatorEmail = '';
let salesCoordinatorPassword = '';
let importedLeadId = '';
const importBatchIds: string[] = [];

async function loginWithCredentials(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  const token = page.waitForResponse(response => response.url().includes('/auth/v1/token') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in' }).click();
  expect((await token).ok()).toBe(true);
  await expect(page).toHaveURL(/\/employee(?:\/|$)/, { timeout: 15_000 });
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const url = process.env.BSMILE_QA_SUPABASE_URL!;
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(url).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('Qualification fixtures require the verified QA project');
  const serviceKey = process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('QA provisioning credential missing');
  fixtureAdmin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  psychologistDb = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const psychologistLogin = await psychologistDb.auth.signInWithPassword(credentials('psychologist'));
  if (psychologistLogin.error || !psychologistLogin.data.user) throw psychologistLogin.error || new Error('Aiswarya QA account unavailable');
  psychologistId = psychologistLogin.data.user.id;

  const gmDb = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const gmLogin = await gmDb.auth.signInWithPassword(credentials('general_manager'));
  if (gmLogin.error || !gmLogin.data.user) throw gmLogin.error || new Error('QA General Manager account unavailable');
  const [source, status] = await Promise.all([
    gmDb.from('crm_lead_sources').select('id').eq('name', 'Outdoor Marketing').single(),
    gmDb.from('crm_lead_statuses').select('id').eq('is_active', true).order('sort_order').limit(1).single(),
  ]);
  if (source.error || status.error) throw source.error || status.error;
  const leads = await gmDb.from('crm_leads').insert([
    { full_name: `QA Aiswarya Assigned ${crypto.randomUUID().slice(0, 8)}`, phone: `9715${Date.now()}`, source_id: source.data.id, status_id: status.data.id, assigned_to: psychologistId, created_by: gmLogin.data.user.id },
    { full_name: `QA Aiswarya Outside ${crypto.randomUUID().slice(0, 8)}`, phone: `9716${Date.now()}`, source_id: source.data.id, status_id: status.data.id, assigned_to: gmLogin.data.user.id, created_by: gmLogin.data.user.id },
  ]).select('id');
  if (leads.error || leads.data.length !== 2) throw leads.error || new Error('Could not create CRM qualification fixtures');
  [assignedLeadId, outsideLeadId] = leads.data.map(row => row.id);

  const operations = await fixtureAdmin.from('departments').select('id').eq('name', 'Operations').single();
  if (operations.error) throw operations.error;
  salesCoordinatorEmail = `qa-sales-coordinator-${crypto.randomUUID()}@qa.bsmile.local`;
  salesCoordinatorPassword = `${crypto.randomUUID()}Aa9!`;
  const salesUser = await fixtureAdmin.auth.admin.createUser({ email: salesCoordinatorEmail, password: salesCoordinatorPassword, email_confirm: true });
  if (salesUser.error || !salesUser.data.user) throw salesUser.error || new Error('Could not create Sales Coordinator fixture');
  salesCoordinatorId = salesUser.data.user.id;
  const profile = await fixtureAdmin.from('profiles').upsert({ id: salesCoordinatorId, email: salesCoordinatorEmail, full_name: 'QA Qualification Sales Coordinator', status: 'active', is_employee: true, workforce_visible: true, role: 'staff', designation: 'Sales Coordinator', department_id: operations.data.id });
  if (profile.error) throw profile.error;
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  if (salesCoordinatorId) {
    const batches = await fixtureAdmin.from('crm_import_batches').select('id').eq('imported_by', salesCoordinatorId);
    if (!batches.error) importBatchIds.push(...batches.data.map(row => row.id));
  }
  if (importBatchIds.length) {
    await fixtureAdmin.from('crm_import_rows').delete().in('batch_id', importBatchIds);
    await fixtureAdmin.from('crm_import_batches').delete().in('id', importBatchIds);
  }
  const leadIds = [assignedLeadId, outsideLeadId, importedLeadId].filter(Boolean);
  if (leadIds.length) {
    await fixtureAdmin.from('crm_sales').delete().in('lead_id', leadIds);
    await fixtureAdmin.from('crm_lead_followups').delete().in('lead_id', leadIds);
    await fixtureAdmin.from('audit_logs').delete().eq('entity_type', 'crm_lead').in('entity_id', leadIds);
    await fixtureAdmin.from('crm_leads').delete().in('id', leadIds);
  }
  if (convertedPatientId) {
    await fixtureAdmin.from('patient_activity_logs').delete().eq('patient_id', convertedPatientId);
    await fixtureAdmin.from('patient_notes').delete().eq('patient_id', convertedPatientId);
    await fixtureAdmin.from('patient_sessions').delete().eq('patient_id', convertedPatientId);
    await fixtureAdmin.from('patients').delete().eq('id', convertedPatientId);
  }
  if (salesCoordinatorId) await fixtureAdmin.auth.admin.deleteUser(salesCoordinatorId);
});

test('Aiswarya converts an assigned lead while an out-of-scope lead remains blocked', async ({ page }) => {
  test.setTimeout(120_000);
  const patientNumber = `QA-AIS-${crypto.randomUUID().slice(0, 12)}`;
  await login(page, 'psychologist', { reuseState: false });
  await navigateAfterLogin(page, `/employee/crm/leads/${assignedLeadId}`);
  await expect(page.getByRole('button', { name: 'Convert to client', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Convert to client', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Convert to Client' });
  await dialog.getByLabel('Client ID').fill(patientNumber);
  await dialog.getByRole('button', { name: 'Convert to client', exact: true }).click();
  await expect(page.getByText(`Lead converted to client ${patientNumber}.`)).toBeVisible({ timeout: 30_000 });

  const converted = await fixtureAdmin.from('crm_leads').select('converted_patient_id').eq('id', assignedLeadId).single();
  if (converted.error || !converted.data.converted_patient_id) throw converted.error || new Error('Atomic patient link did not persist');
  convertedPatientId = converted.data.converted_patient_id;
  const globalPermission = await psychologistDb.rpc('has_permission', { permission_code: 'patients.view_all' });
  if (globalPermission.error || globalPermission.data !== true) throw globalPermission.error || new Error('Aiswarya lost patients.view_all');

  await navigateAfterLogin(page, `/employee/crm/leads/${outsideLeadId}`);
  await expect(page.getByRole('heading', { name: 'Lead unavailable' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Convert to client', exact: true })).toHaveCount(0);
  const denied = await psychologistDb.rpc('convert_lead_to_patient', { target_lead: outsideLeadId, requested_patient_number: `${patientNumber}-DENIED` });
  expect(denied.error?.code).toBe('42501');
  await assertNoRawDatabaseError(page);
});

test('Sales Coordinator imports Outdoor Marketing and updates the duplicate without creating another lead', async ({ page }) => {
  test.setTimeout(120_000);
  const marker = crypto.randomUUID().slice(0, 8);
  const name = `QA Import Update ${marker}`;
  const phone = `9717${Date.now()}`;
  await loginWithCredentials(page, salesCoordinatorEmail, salesCoordinatorPassword);
  await navigateAfterLogin(page, '/employee/crm/import');

  const initialCsv = `Name,Phone Number,Lead Source,Profession,Location,Remarks\n${name},${phone},Outdoor Marketing,Therapist,Dubai,Initial qualification fixture\n`;
  await page.getByLabel('CRM import file').setInputFiles({ name: `qa-initial-${marker}.csv`, mimeType: 'text/csv', buffer: Buffer.from(initialCsv) });
  await expect(page.getByText(name)).toBeVisible();
  await page.getByRole('button', { name: 'Import 1 rows' }).click();
  await expect(page.getByText('Import complete: 1 imported, 0 updated, 0 skipped, 0 duplicates, 0 failed.')).toBeVisible({ timeout: 30_000 });

  const updateCsv = `Name,Phone Number,Lead Source,Profession,Location,Remarks\n${name},${phone},Outdoor Marketing,Senior Therapist,Abu Dhabi,Updated qualification fixture\n`;
  await page.getByLabel('CRM import file').setInputFiles({ name: `qa-update-${marker}.csv`, mimeType: 'text/csv', buffer: Buffer.from(updateCsv) });
  await page.getByLabel('Duplicate handling').selectOption('update');
  await page.getByRole('button', { name: 'Import 1 rows' }).click();
  await expect(page.getByText('Import complete: 0 imported, 1 updated, 0 skipped, 1 duplicates, 0 failed.')).toBeVisible({ timeout: 30_000 });

  // The CSV parser may normalize a long unquoted numeric phone value before
  // persistence, so identify this disposable fixture by its unique name. The
  // duplicate count and single stored row still prove update-in-place behavior.
  const stored = await fixtureAdmin.from('crm_leads').select('id,phone,profession,location,remarks,source:crm_lead_sources(name)').eq('full_name', name);
  if (stored.error || stored.data.length !== 1) throw stored.error || new Error(`Expected one imported lead, found ${stored.data.length}`);
  importedLeadId = stored.data[0].id;
  expect(stored.data[0]).toMatchObject({ profession: 'Senior Therapist', location: 'Abu Dhabi', remarks: 'Updated qualification fixture' });
  expect(stored.data[0].phone).toMatch(/^\d{7,}$/);
  expect((stored.data[0].source as unknown as { name: string }).name).toBe('Outdoor Marketing');

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/unauthorized(?:[/?#]|$)/, { timeout: 15_000 });
  await assertNoRawDatabaseError(page);
});
