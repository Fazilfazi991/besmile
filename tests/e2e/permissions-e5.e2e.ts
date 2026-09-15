import { expect, test } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { assertNoRawDatabaseError, credentials, login, navigateAfterLogin } from './helpers';

let fixtureAdmin: SupabaseClient;
let assistantId: string;
let psychologistId: string;
let leadId: string;
let patientId: string;
let patientSlug: string;
let meetingId: string;
let meetingTitle: string;
let officialDocumentId: string;
let restrictedDocumentId: string;
let officialPath: string;
let restrictedPath: string;
const createdPatientDocuments: string[] = [];
const createdPatientPaths: string[] = [];

async function createUser(label: string, profile: Record<string, unknown>) {
  const email = `e5-browser-${label}-${crypto.randomUUID()}@qa.bsmile.local`;
  const password = `${crypto.randomUUID()}Aa9!`;
  const created = await fixtureAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error(`Could not provision ${label}`);
  const saved = await fixtureAdmin.from('profiles').upsert({ id: created.data.user.id, email, status: 'active', is_employee: true, workforce_visible: true, ...profile });
  if (saved.error) throw saved.error;
  return { id: created.data.user.id, email, password };
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const url = process.env.BSMILE_QA_SUPABASE_URL!;
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(url).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('E5 browser fixtures require QA');
  const serviceKey = process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('QA provisioning credential missing');
  fixtureAdmin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const department = await fixtureAdmin.from('departments').select('id').eq('name', 'Administration').single();
  if (department.error) throw department.error;
  const assistant = await createUser('assistant', { full_name: 'QA E5 Assistant Manager', role: 'staff', designation: 'Assistant Manager', department_id: department.data.id });
  const psychologist = await createUser('psychologist', { full_name: 'QA E5 Psychologist', role: 'psychologist', designation: 'Psychologist' });
  assistantId = assistant.id; psychologistId = psychologist.id;
  process.env.BSMILE_QA_ASSISTANT_MANAGER_EMAIL = assistant.email;
  process.env.BSMILE_QA_ASSISTANT_MANAGER_PASSWORD = assistant.password;
  process.env.BSMILE_QA_PSYCHOLOGIST_EMAIL = psychologist.email;
  process.env.BSMILE_QA_PSYCHOLOGIST_PASSWORD = psychologist.password;

  const assistantDb = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const assistantLogin = await assistantDb.auth.signInWithPassword({ email: assistant.email, password: assistant.password });
  if (assistantLogin.error) throw assistantLogin.error;
  const [source, status] = await Promise.all([
    assistantDb.from('crm_lead_sources').select('id').eq('is_active', true).limit(1).single(),
    assistantDb.from('crm_lead_statuses').select('id').eq('is_active', true).order('sort_order').limit(1).single(),
  ]);
  if (source.error || status.error) throw source.error || status.error;
  const lead = await assistantDb.from('crm_leads').insert({ full_name: 'QA E5 Browser Conversion', phone: `E5-${Date.now()}`, source_id: source.data.id, status_id: status.data.id, assigned_to: assistantId, created_by: assistantId }).select('id').single();
  if (lead.error) throw lead.error;
  leadId = lead.data.id;

  const gm = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const gmLogin = await gm.auth.signInWithPassword(credentials('general_manager'));
  if (gmLogin.error || !gmLogin.data.user) throw gmLogin.error || new Error('GM fixture unavailable');
  const employee = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const employeeLogin = await employee.auth.signInWithPassword(credentials('employee'));
  if (employeeLogin.error || !employeeLogin.data.user) throw employeeLogin.error || new Error('Employee fixture unavailable');

  const patient = await fixtureAdmin.from('patients').insert({ patient_number: `E5-B-${crypto.randomUUID()}`, full_name: 'QA E5 Authorized Client', status: 'active', source: 'Other', assigned_psychologist_id: psychologistId, created_by: gmLogin.data.user.id }).select('id,slug').single();
  if (patient.error) throw patient.error;
  patientId = patient.data.id; patientSlug = patient.data.slug;

  const hosts = await gm.rpc('meeting_hosts');
  if (hosts.error || !hosts.data?.length) throw hosts.error || new Error('No authorized QA meeting host');
  const start = new Date(Date.now() + 75 * 86400_000);
  meetingTitle = `QA E5 Shared Notes ${crypto.randomUUID()}`;
  const meeting = await gm.rpc('save_meeting', { target_meeting: null, host_profile_id: hosts.data[0].id, meeting_title: meetingTitle, meeting_agenda: 'Verify author-attributed meeting notes', meeting_start: start.toISOString(), meeting_end: new Date(+start + 3600000).toISOString(), meeting_type_value: 'office', meeting_venue: '', meeting_url_value: '', meeting_description: '', participant_ids: [employeeLogin.data.user.id] });
  if (meeting.error) throw meeting.error;
  meetingId = meeting.data;

  officialPath = `company/e5-browser/${crypto.randomUUID()}.pdf`;
  restrictedPath = `company/e5-browser/${crypto.randomUUID()}.pdf`;
  for (const path of [officialPath, restrictedPath]) {
    const upload = await fixtureAdmin.storage.from('employee-documents').upload(path, new Uint8Array([37,80,68,70,45,49,46,52]), { contentType: 'application/pdf' });
    if (upload.error) throw upload.error;
  }
  const documents = await fixtureAdmin.from('documents').insert([
    { title: 'QA E5 Shared Official Policy', category: 'Policy', storage_path: officialPath, file_name: 'shared.pdf', mime_type: 'application/pdf', file_size: 8, uploaded_by: gmLogin.data.user.id },
    { title: 'QA E5 Restricted Management File', category: 'Policy', storage_path: restrictedPath, file_name: 'restricted.pdf', mime_type: 'application/pdf', file_size: 8, uploaded_by: gmLogin.data.user.id },
  ]).select('id,storage_path');
  if (documents.error) throw documents.error;
  officialDocumentId = documents.data.find(item => item.storage_path === officialPath)!.id;
  restrictedDocumentId = documents.data.find(item => item.storage_path === restrictedPath)!.id;
  const share = await fixtureAdmin.from('document_shares').insert({ document_id: officialDocumentId, profile_id: assistantId, shared_with_all: false });
  if (share.error) throw share.error;
});

test.afterAll(async () => {
  // QA Storage/Auth cleanup can take longer than Playwright's default hook
  // window during a transient transport reset; keep the cleanup mandatory.
  test.setTimeout(180_000);
  if (createdPatientPaths.length) await fixtureAdmin.storage.from('patient-documents').remove(createdPatientPaths);
  if (createdPatientDocuments.length) await fixtureAdmin.from('patient_documents').delete().in('id', createdPatientDocuments);
  if (patientId) await fixtureAdmin.from('patients').delete().eq('id', patientId);
  if (meetingId) {
    await fixtureAdmin.from('meeting_note_entries').delete().eq('meeting_id', meetingId);
    await fixtureAdmin.from('meeting_events').delete().eq('meeting_id', meetingId);
    await fixtureAdmin.from('meeting_participants').delete().eq('meeting_id', meetingId);
    await fixtureAdmin.from('meetings').delete().eq('id', meetingId);
  }
  if (officialDocumentId || restrictedDocumentId) {
    await fixtureAdmin.from('document_shares').delete().in('document_id', [officialDocumentId, restrictedDocumentId].filter(Boolean));
    await fixtureAdmin.from('documents').delete().in('id', [officialDocumentId, restrictedDocumentId].filter(Boolean));
  }
  if (officialPath || restrictedPath) await fixtureAdmin.storage.from('employee-documents').remove([officialPath, restrictedPath].filter(Boolean));
  if (leadId) {
    await fixtureAdmin.from('crm_sales').delete().eq('lead_id', leadId);
    await fixtureAdmin.from('crm_lead_followups').delete().eq('lead_id', leadId);
    await fixtureAdmin.from('crm_leads').delete().eq('id', leadId);
  }
  if (assistantId) await fixtureAdmin.auth.admin.deleteUser(assistantId);
  if (psychologistId) await fixtureAdmin.auth.admin.deleteUser(psychologistId);
  delete process.env.BSMILE_QA_ASSISTANT_MANAGER_EMAIL;
  delete process.env.BSMILE_QA_ASSISTANT_MANAGER_PASSWORD;
  delete process.env.BSMILE_QA_PSYCHOLOGIST_EMAIL;
  delete process.env.BSMILE_QA_PSYCHOLOGIST_PASSWORD;
});

test('Assistant Manager converts Lead to Sale with a persistent amount and sees intended official documents', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'assistant_manager');
  await navigateAfterLogin(page, `/admin/crm/leads/${leadId}`);
  await expect(page.getByRole('heading', { name: 'Sale conversion' })).toBeVisible();
  const amount = page.getByRole('spinbutton', { name: 'Sale value' });
  await expect(amount).toBeVisible();
  await amount.fill('5432.10');
  await page.getByRole('button', { name: 'Convert to sale', exact: true }).click();
  await expect(page.getByText('Lead converted to a sale.')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  const persisted = await fixtureAdmin.from('crm_sales').select('id,sale_value').eq('lead_id', leadId).single();
  if (persisted.error || Number(persisted.data?.sale_value) !== 5432.1) throw persisted.error || new Error('QA sale amount did not persist');
  await expect(page.getByRole('heading', { name: 'Sale conversion' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/5432(?:\.1|\.10)?/)).toBeVisible({ timeout: 30_000 });
  await navigateAfterLogin(page, '/employee/documents');
  await expect(page.getByRole('heading', { name: 'Official Documents' })).toBeVisible();
  await expect(page.getByText('QA E5 Shared Official Policy')).toBeVisible();
  await expect(page.getByText('QA E5 Restricted Management File')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await assertNoRawDatabaseError(page);
});

test('Psychologist navigates the complete assigned-client workspace and uploads a document', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'psychologist');
  await navigateAfterLogin(page, `/employee/patients/${patientSlug}`);
  await expect(page.getByRole('heading', { name: 'QA E5 Authorized Client' })).toBeVisible();
  for (const tab of ['Appointments', 'Sessions', 'Notes', 'Activity']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByRole('heading', { name: tab, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Upload Document', exact: true }).click();
  const marker = `QA E5 Browser Upload ${Date.now()}`;
  await page.locator('input[name="file"]').setInputFiles({ name: 'e5.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await page.getByPlaceholder('Document name').fill(marker);
  await page.getByPlaceholder('Category').fill('Clinical');
  await page.locator('input[name="documentDate"]').fill(new Date().toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Document uploaded.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(marker)).toBeVisible();
  const uploadedDocument = await fixtureAdmin.from('patient_documents').select('id,storage_key').eq('patient_id', patientId).eq('document_name', marker).single();
  if (uploadedDocument.error) throw uploadedDocument.error;
  createdPatientDocuments.push(uploadedDocument.data.id); createdPatientPaths.push(uploadedDocument.data.storage_key);
  await expect(page.getByRole('button', { name: 'Open document', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download document', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await assertNoRawDatabaseError(page);
});

test('authorized meeting participant adds an attributed note while unrelated Assistant Manager cannot see the meeting', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'employee');
  await navigateAfterLogin(page, '/employee/meetings');
  await page.getByRole('button', { name: new RegExp(meetingTitle) }).click();
  await expect(page.getByRole('heading', { name: 'Shared notes', exact: true })).toBeVisible();
  const marker = `Browser note ${Date.now()}`;
  await page.getByLabel('Add a note').fill(marker);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText(marker)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.meeting-notes li').filter({ hasText: marker }).locator('b')).toHaveText(/\S/);
  await expect(page.locator('.meeting-notes li').filter({ hasText: marker }).locator('time')).toHaveText(/\S/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await assertNoRawDatabaseError(page);

  await page.context().clearCookies();
  await page.goto('/sign-in');
  await login(page, 'assistant_manager');
  await navigateAfterLogin(page, '/employee/meetings');
  await expect(page.getByText(meetingTitle)).toHaveCount(0);
  await assertNoRawDatabaseError(page);
});
