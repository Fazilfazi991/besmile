import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { assertNoRawDatabaseError, credentials, login, navigateAfterLogin } from './helpers';

let fixtureAdmin: SupabaseClient;
let assistantId: string;
let psychologistId: string;
let psychologistName: string;
let leadId: string;
let patientId: string;
let patientSlug: string;
let meetingId: string;
let meetingTitle: string;
let officialDocumentId: string;
let restrictedDocumentId: string;
let officialPath: string;
let restrictedPath: string;
let generatedOfferId: string;
let generatedOfferPath: string;
const createdPatientDocuments: string[] = [];
const createdPatientPaths: string[] = [];
const originalAssistantManagerEmail = process.env.BSMILE_QA_ASSISTANT_MANAGER_EMAIL;
const originalAssistantManagerPassword = process.env.BSMILE_QA_ASSISTANT_MANAGER_PASSWORD;
const originalPsychologistEmail = process.env.BSMILE_QA_PSYCHOLOGIST_EMAIL;
const originalPsychologistPassword = process.env.BSMILE_QA_PSYCHOLOGIST_PASSWORD;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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
  psychologistName = `QA E5 Psychologist ${crypto.randomUUID().slice(0, 8)}`;
  const psychologist = await createUser('psychologist', { full_name: psychologistName, role: 'psychologist', designation: 'Psychologist' });
  assistantId = assistant.id; psychologistId = psychologist.id;
  // Production Assistant Managers receive this existing read scope through the
  // canonical scheduling provisioning migration. Mirror that scope for this
  // disposable user; the upload capability itself must still come from the
  // designation bundle under test.
  const existingPatientPermissions = await fixtureAdmin.from('permissions').select('id,code').in('code', ['patients.view_all', 'patient_documents.view', 'patient_documents.download']);
  if (existingPatientPermissions.error || existingPatientPermissions.data.length !== 3) throw existingPatientPermissions.error || new Error('Assistant Manager patient fixture permissions are unavailable');
  const patientViewGrant = await fixtureAdmin.from('user_permission_grants').insert(existingPatientPermissions.data.map(permission => ({ profile_id: assistantId, permission_id: permission.id, reason: 'QA Assistant Manager existing patient read-scope fixture' })));
  if (patientViewGrant.error) throw patientViewGrant.error;
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
  if (generatedOfferId) await fixtureAdmin.from('documents').delete().eq('id', generatedOfferId);
  if (generatedOfferPath) await fixtureAdmin.storage.from('employee-documents').remove([generatedOfferPath]);
  if (leadId) {
    const sales = await fixtureAdmin.from('crm_sales').select('id').eq('lead_id', leadId);
    const saleIds = (sales.data || []).map(sale => sale.id);
    if (saleIds.length) {
      await fixtureAdmin.from('finance_invoice_payments').delete().in('conversion_sale_id', saleIds);
      await fixtureAdmin.from('finance_transactions').delete().in('sale_id', saleIds);
      await fixtureAdmin.from('finance_invoices').delete().in('sale_id', saleIds);
    }
    await fixtureAdmin.from('crm_sales').delete().eq('lead_id', leadId);
    await fixtureAdmin.from('crm_lead_followups').delete().eq('lead_id', leadId);
    await fixtureAdmin.from('crm_leads').delete().eq('id', leadId);
  }
  const disposableProfileIds = [assistantId, psychologistId].filter(Boolean);
  if (disposableProfileIds.length) await fixtureAdmin.from('user_permission_grants').delete().in('profile_id', disposableProfileIds);
  if (assistantId) await fixtureAdmin.auth.admin.deleteUser(assistantId);
  if (psychologistId) await fixtureAdmin.auth.admin.deleteUser(psychologistId);
  if (disposableProfileIds.length) await fixtureAdmin.from('profiles').delete().in('id', disposableProfileIds);
  restoreEnvironment('BSMILE_QA_ASSISTANT_MANAGER_EMAIL', originalAssistantManagerEmail);
  restoreEnvironment('BSMILE_QA_ASSISTANT_MANAGER_PASSWORD', originalAssistantManagerPassword);
  restoreEnvironment('BSMILE_QA_PSYCHOLOGIST_EMAIL', originalPsychologistEmail);
  restoreEnvironment('BSMILE_QA_PSYCHOLOGIST_PASSWORD', originalPsychologistPassword);
});

test('Assistant Manager converts Lead to Sale with a persistent amount and sees intended official documents', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'assistant_manager');
  await navigateAfterLogin(page, `/admin/crm/leads/${leadId}`);
  await expect(page.getByRole('heading', { name: 'Sale conversion' })).toBeVisible();
  const amount = page.getByRole('spinbutton', { name: 'Sale amount' });
  await expect(amount).toBeVisible();
  await amount.fill('5432.10');
  await page.getByLabel('Invoice due date *').fill(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
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

test('Assistant Manager creates, previews, saves, and reopens a UUID-linked Offer Letter without private-document access', async ({ page, request }) => {
  test.setTimeout(120_000);
  await login(page, 'assistant_manager');
  await navigateAfterLogin(page, '/employee/documents');
  await expect(page.getByRole('link', { name: 'Create Document' })).toBeVisible();
  await page.getByRole('link', { name: 'Create Document' }).click();
  await expect(page.getByRole('heading', { name: 'Official Document Generator' })).toBeVisible();
  const documentType = page.getByRole('combobox', { name: 'Document type' });
  await expect(documentType).toHaveValue('offer_letter');
  const availableTypes = await documentType.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  expect(availableTypes).toEqual(['offer_letter', 'appointment_letter', 'experience_letter', 'general_report', 'sales_report', 'custom_official_document']);
  for (const restricted of ['salary_slip', 'payment_statement', 'invoice', 'performance_report', 'policy']) expect(availableTypes).not.toContain(restricted);
  const restrictedStatus = await page.evaluate(async () => {
    const response = await fetch('/api/documents/official/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentType: 'salary_slip', issueDate: '2026-09-15', title: 'Denied', body: 'Denied', mode: 'preview' }),
    });
    return response.status;
  });
  expect(restrictedStatus).toBe(403);

  const search = page.getByRole('combobox', { name: 'Select employee' });
  await search.fill(psychologistName);
  const employee = page.getByRole('option', { name: psychologistName });
  await expect(employee).toBeVisible();
  await employee.click();
  await expect(page.getByRole('textbox', { name: 'Employee / candidate' })).toHaveValue(psychologistName);
  await expect(page.getByRole('textbox', { name: 'Position / designation' })).toHaveValue('Psychologist');
  await page.getByLabel('Joining date', { exact: true }).fill('2026-10-01');
  await expect(page.getByRole('textbox', { name: 'Official content' })).toHaveValue(/2026-10-01/);
  const previewResponse = page.waitForResponse(response => response.url().endsWith('/api/documents/official/generate') && response.request().postDataJSON()?.mode === 'preview');
  await page.getByRole('button', { name: 'Preview PDF' }).click();
  const preview = await previewResponse;
  expect(preview.status()).toBe(200);
  expect(preview.headers()['content-type']).toContain('application/pdf');
  await expect(page.getByTitle('Official document PDF preview')).toBeVisible();
  await expect(page.getByText('Preview ready. This is the same PDF that will be downloaded.')).toBeVisible();
  const previewUrl = await page.getByTitle('Official document PDF preview').getAttribute('src');
  expect(previewUrl).toMatch(/^blob:/);
  const previewPdf = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
    return { magic: new TextDecoder().decode(bytes.subarray(0, 4)), size: bytes.length };
  }, previewUrl);
  expect(previewPdf.magic).toBe('%PDF');
  expect(previewPdf.size).toBeGreaterThan(1_000);

  const generatedResponse = page.waitForResponse(response => response.url().endsWith('/api/documents/official/generate') && response.request().postDataJSON()?.mode === 'generate');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate & download' }).click();
  const generated = await generatedResponse;
  expect(generated.status()).toBe(200);
  expect(generated.headers()['content-type']).toContain('application/pdf');
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toMatch(/^BSmile_Offer_Letter_QA_E5_Psychologist_.*\.pdf$/);
  const downloadedPdf = await readFile(await downloaded.path());
  expect(downloadedPdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(downloadedPdf.length).toBeGreaterThan(1_000);
  generatedOfferId = generated.headers()['x-document-id'];
  expect(generatedOfferId).toBeTruthy();
  const saved = await fixtureAdmin.from('documents').select('id,source_type,document_type,related_profile_id,uploaded_by,storage_path,official_status').eq('id', generatedOfferId).single();
  if (saved.error) throw saved.error;
  generatedOfferPath = saved.data.storage_path;
  expect(saved.data).toMatchObject({ source_type: 'official_generated', document_type: 'offer_letter', related_profile_id: psychologistId, uploaded_by: assistantId, official_status: 'available' });
  expect(generatedOfferPath).toContain(`company/${assistantId}/official/`);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText(`Offer Letter - ${psychologistName}`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('QA E5 Restricted Management File')).toHaveCount(0);
  const offer = page.getByRole('button', { name: `Offer Letter - ${psychologistName}` });
  await expect(offer).toBeVisible();
  const signedResponse = page.waitForResponse(response => response.url().includes('/storage/v1/object/sign/employee-documents/') && response.request().method() === 'POST');
  const popup = page.waitForEvent('popup');
  await offer.click();
  const signed = await signedResponse;
  expect(signed.status()).toBe(200);
  const signedPayload = await signed.json() as { signedURL?: string; signedUrl?: string };
  const signedPath = signedPayload.signedURL || signedPayload.signedUrl;
  expect(signedPath).toBeTruthy();
  await popup;
  const signedEndpoint = signedPath!.startsWith('http') ? signedPath! : signedPath!.startsWith('/storage/v1') ? signedPath! : `/storage/v1${signedPath}`;
  const savedPdfResponse = await request.get(new URL(signedEndpoint, process.env.BSMILE_QA_SUPABASE_URL).toString());
  expect(savedPdfResponse.status()).toBe(200);
  expect(savedPdfResponse.headers()['content-type']).toContain('application/pdf');
  expect((await savedPdfResponse.body()).subarray(0, 4).toString()).toBe('%PDF');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await assertNoRawDatabaseError(page);
});

test('unauthorized employee cannot reach the official creator or generate restricted PDFs', async ({ page }) => {
  await login(page, 'employee');
  await navigateAfterLogin(page, '/employee/documents');
  await expect(page.getByRole('link', { name: 'Create Document' })).toHaveCount(0);
  await page.goto('/employee/documents/generate');
  await expect(page).toHaveURL(/\/unauthorized/);
  const response = await page.evaluate(async () => {
    const request = await fetch('/api/documents/official/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentType: 'salary_slip', issueDate: '2026-09-15', title: 'Denied', body: 'Denied', mode: 'generate' }),
    });
    return request.status;
  });
  expect(response).toBe(403);
  await assertNoRawDatabaseError(page);
});

test('Assistant Manager uploads and reopens a patient document through the scoped lifecycle', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'assistant_manager');
  await navigateAfterLogin(page, `/admin/patients/${patientSlug}`);
  await expect(page.getByRole('heading', { name: 'QA E5 Authorized Client' })).toBeVisible();
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Upload Document', exact: true }).click();
  const marker = `QA Assistant Patient Upload ${Date.now()}`;
  await page.locator('input[name="file"]').setInputFiles({ name: 'assistant-manager.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await page.getByPlaceholder('Document name').fill(marker);
  await page.getByPlaceholder('Category').fill('Administration');
  await page.locator('input[name="documentDate"]').fill(new Date().toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Document uploaded.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(marker)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByText(marker)).toBeVisible();
  const uploadedDocument = await fixtureAdmin.from('patient_documents').select('id,storage_key').eq('patient_id', patientId).eq('document_name', marker).single();
  if (uploadedDocument.error) throw uploadedDocument.error;
  createdPatientDocuments.push(uploadedDocument.data.id);
  createdPatientPaths.push(uploadedDocument.data.storage_key);
  await expect(page.getByRole('button', { name: 'Open document', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download document', exact: true }).last()).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Open document', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download document', exact: true }).last()).toBeVisible();
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
