import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { credentials, login, navigateAfterLogin } from './helpers';

test.describe.configure({ mode: 'serial' });

let root: SupabaseClient;
let gm: SupabaseClient;
let employee: SupabaseClient;
let psychologist: SupabaseClient;
let gmId = '';
let employeeId = '';
let psychologistId = '';
let assistant: SupabaseClient;
let assistantId = '';
let invalidLeadId = '';
const leadIds: string[] = [];
const patientIds: string[] = [];

const requireData = (result: { data: any; error: any }, label: string): any => {
  if (result.error || result.data === null) throw new Error(`${label}: ${result.error?.message || 'missing data'}`);
  return result.data;
};

async function signedIn(role: string) {
  const db = createClient(process.env.BSMILE_QA_SUPABASE_URL!, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const prefix = `BSMILE_QA_${role}_`;
  const auth = await db.auth.signInWithPassword({ email: process.env[`${prefix}EMAIL`]!, password: process.env[`${prefix}PASSWORD`]! });
  if (auth.error || !auth.data.user) throw auth.error || new Error(`${role} fixture unavailable`);
  return { db, id: auth.data.user.id };
}

async function createLead(gender: string | null, assignedTo: string, createdBy = gmId) {
  const [source, status] = await Promise.all([
    root.from('crm_lead_sources').select('id').eq('is_active', true).limit(1).single(),
    root.from('crm_lead_statuses').select('id').eq('is_active', true).order('sort_order').limit(1).single(),
  ]);
  const marker = crypto.randomUUID();
  const created = await root.from('crm_leads').insert({
    full_name: `QA Gender Hotfix ${marker}`,
    phone: `971${Date.now()}${Math.floor(Math.random() * 1000)}`,
    gender,
    source_id: requireData(source, 'lead source').id,
    status_id: requireData(status, 'lead status').id,
    assigned_to: assignedTo,
    created_by: createdBy,
  }).select('id').single();
  const id = requireData(created, 'create gender lead').id;
  leadIds.push(id);
  return id;
}

async function convert(db: SupabaseClient, leadId: string, suffix: string) {
  const patientNumber = `QA-GENDER-${suffix}-${crypto.randomUUID().slice(0, 10)}`;
  const result = await db.rpc('convert_lead_to_patient', { target_lead: leadId, requested_patient_number: patientNumber });
  if (result.error) throw result.error;
  const lead = requireData(await root.from('crm_leads').select('converted_patient_id').eq('id', leadId).single(), 'converted lead');
  if (!lead.converted_patient_id) throw new Error('conversion did not link a patient');
  patientIds.push(lead.converted_patient_id);
  const patient = requireData(await root.from('patients').select('id,gender,patient_number').eq('id', lead.converted_patient_id).single(), 'converted patient');
  return { patient, patientNumber };
}

test.beforeAll(async () => {
  const url = process.env.BSMILE_QA_SUPABASE_URL!;
  if (process.env.BSMILE_QA_PROJECT_REF !== 'enylrvmjgbntkrgpqsfe' || new URL(url).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('Gender hotfix fixtures require QA');
  root = createClient(url, process.env.BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  ({ db: gm, id: gmId } = await signedIn('GENERAL_MANAGER'));
  ({ db: employee, id: employeeId } = await signedIn('EMPLOYEE'));
  ({ db: psychologist, id: psychologistId } = await signedIn('PSYCHOLOGIST'));

  const email = `gender-assistant-${crypto.randomUUID()}@qa.bsmile.local`;
  const password = `${crypto.randomUUID()}Aa9!`;
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error('Assistant Manager fixture creation failed');
  assistantId = created.data.user.id;
  const profile = await root.from('profiles').upsert({ id: assistantId, email, full_name: 'QA Gender Assistant Manager', role: 'staff', designation: 'Assistant Manager', status: 'active', is_employee: true, workforce_visible: true });
  if (profile.error) throw profile.error;
  assistant = createClient(url, process.env.BSMILE_QA_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const assistantLogin = await assistant.auth.signInWithPassword({ email, password });
  if (assistantLogin.error || !assistantLogin.data.user) throw assistantLogin.error || new Error('Assistant Manager login failed');
});

test.afterAll(async () => {
  if (leadIds.length) {
    await root.from('crm_sales').delete().in('lead_id', leadIds);
    await root.from('crm_lead_followups').delete().in('lead_id', leadIds);
    await root.from('audit_logs').delete().eq('entity_type', 'crm_lead').in('entity_id', leadIds);
    await root.from('crm_leads').delete().in('id', leadIds);
  }
  if (patientIds.length) {
    await root.from('patient_activity_logs').delete().in('patient_id', patientIds);
    await root.from('patient_notes').delete().in('patient_id', patientIds);
    await root.from('patient_sessions').delete().in('patient_id', patientIds);
    await root.from('patients').delete().in('id', patientIds);
  }
  if (assistantId) await root.auth.admin.deleteUser(assistantId);
  for (const db of [gm, employee, psychologist, assistant]) if (db) await db.auth.signOut();
});

test('normalizes canonical, case-spaced, blank, and whitespace gender values', async () => {
  for (const [input, expected, label] of [
    ['male', 'male', 'male'],
    ['  Male  ', 'male', 'male-spaced'],
    ['female', 'female', 'female'],
    ['  Female  ', 'female', 'female-spaced'],
    ['', null, 'blank'],
    ['   ', null, 'whitespace'],
  ] as const) {
    const leadId = await createLead(input, gmId);
    const { patient } = await convert(gm, leadId, label);
    expect(patient.gender).toBe(expected);
  }
});

test('rejects unsupported nonblank gender atomically and shows the friendly modal error', async ({ page }) => {
  invalidLeadId = await createLead('Woman', gmId);
  const patientNumber = `QA-GENDER-REJECT-${crypto.randomUUID().slice(0, 10)}`;
  const rejected = await gm.rpc('convert_lead_to_patient', { target_lead: invalidLeadId, requested_patient_number: patientNumber });
  expect(rejected.error?.message).toContain('Lead gender must be Male or Female');
  const lead = requireData(await root.from('crm_leads').select('converted_at,converted_patient_id').eq('id', invalidLeadId).single(), 'rejected lead');
  expect(lead).toEqual({ converted_at: null, converted_patient_id: null });
  expect(requireData(await root.from('patients').select('id').eq('patient_number', patientNumber), 'rejected patient lookup')).toHaveLength(0);

  await login(page, 'general_manager', { reuseState: false });
  await navigateAfterLogin(page, `/admin/crm/leads/${invalidLeadId}`);
  await page.getByRole('button', { name: 'Convert to client', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Convert to Client' });
  await dialog.getByLabel('Client ID').fill(`${patientNumber}-UI`);
  await dialog.getByRole('button', { name: 'Convert to client', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText("Please correct the lead's gender to Male or Female, or clear it before converting.");
  await expect(page.locator('body')).not.toContainText('patients_gender_check');
  await expect(page.locator('body')).not.toContainText('public.patients');
  await expect(page.locator('body')).not.toContainText('SQLSTATE');
  expect(await dialog.evaluate(node => Number(getComputedStyle(node).zIndex) >= 50)).toBe(true);
  const unchanged = requireData(await root.from('crm_leads').select('converted_at,converted_patient_id').eq('id', invalidLeadId).single(), 'UI rejected lead');
  expect(unchanged).toEqual({ converted_at: null, converted_patient_id: null });
  expect(requireData(await root.from('patients').select('id').like('patient_number', `${patientNumber}%`), 'UI rejected patients')).toHaveLength(0);
});

test('preserves already-converted and unauthorized protections', async () => {
  const convertedLead = await createLead('male', gmId);
  await convert(gm, convertedLead, 'repeat');
  const repeated = await gm.rpc('convert_lead_to_patient', { target_lead: convertedLead, requested_patient_number: `QA-GENDER-REPEAT-${crypto.randomUUID()}` });
  expect(repeated.error?.message).toMatch(/already been converted/i);

  const unauthorizedLead = await createLead('female', gmId);
  const denied = await employee.rpc('convert_lead_to_patient', { target_lead: unauthorizedLead, requested_patient_number: `QA-GENDER-DENIED-${crypto.randomUUID()}` });
  expect(denied.error?.code).toBe('42501');
  const unchanged = requireData(await root.from('crm_leads').select('converted_at,converted_patient_id').eq('id', unauthorizedLead).single(), 'unauthorized lead');
  expect(unchanged).toEqual({ converted_at: null, converted_patient_id: null });
});

test('converts in Assistant Manager and Psychologist intended scopes', async () => {
  const assistantLead = await createLead(' Female ', assistantId, assistantId);
  expect((await convert(assistant, assistantLead, 'assistant')).patient.gender).toBe('female');
  const psychologistLead = await createLead(' Male ', psychologistId, gmId);
  expect((await convert(psychologist, psychologistLead, 'psychologist')).patient.gender).toBe('male');
});
