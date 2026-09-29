import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.BSMILE_LOCAL_QA_PASSWORD;
const evidenceDir = process.env.BSMILE_LOCAL_QA_EVIDENCE_DIR;

if (process.env.BSMILE_LOCAL_QA_ACK !== 'LOCAL_DOCKER_ONLY') throw new Error('Local QA acknowledgement is required.');
const parsedUrl = new URL(url || '');
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) || parsedUrl.port !== '54321') {
  throw new Error('Refusing to run outside the verified local Supabase API on port 54321.');
}
if (!anonKey || !serviceKey || !password || !evidenceDir) throw new Error('Local QA environment is incomplete.');

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const service = createClient(url, serviceKey, { auth: authOptions });
const anon = createClient(url, anonKey, { auth: authOptions });
const run = crypto.randomUUID().slice(0, 8);
const marker = `LQA-${run}`;
const report = { run, marker, startedAt: new Date().toISOString(), checks: [], fixture: {} };

function pass(name, detail = undefined) {
  report.checks.push({ name, status: 'PASS', detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function expectNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || ''} ${result.error.message}`.trim());
  return result.data;
}

async function expectError(promise, label, matcher) {
  const result = await promise;
  assert(result.error, `${label}: expected an error`);
  const combined = `${result.error.code || ''} ${result.error.message || ''} ${result.error.details || ''}`;
  if (matcher) assert.match(combined, matcher, `${label}: unexpected error ${combined}`);
  pass(label);
  return result.error;
}

async function createAuthProfile(key, overrides = {}) {
  const email = `${marker.toLowerCase()}-${key}@example.test`;
  const created = expectNoError(await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { local_qa_run: run },
    user_metadata: { synthetic: true },
  }), `create ${key} Auth user`).user;
  const profile = {
    id: created.id,
    full_name: `${marker} ${key}`,
    email,
    work_email: `${marker.toLowerCase()}-${key}-work@example.test`,
    role: 'staff',
    status: 'active',
    is_employee: true,
    workforce_visible: true,
    login_enabled: true,
    employee_code: `${run.toUpperCase()}-${key.toUpperCase()}`,
    onboarding_required: false,
    ...overrides,
  };
  expectNoError(await service.from('profiles').insert(profile), `create ${key} profile`);
  return { id: created.id, email, key, ...profile };
}

async function signIn(profile, passwordOverride = password) {
  const client = createClient(url, anonKey, { auth: authOptions });
  const result = await client.auth.signInWithPassword({ email: profile.email, password: passwordOverride });
  expectNoError(result, `sign in ${profile.key}`);
  assert.equal(result.data.user.id, profile.id);
  return client;
}

async function rpc(client, name, args, label) {
  return expectNoError(await client.rpc(name, args), label);
}

const first = async (table, query = (value) => value) => {
  const result = await query(service.from(table).select('*')).limit(1).single();
  return expectNoError(result, `read ${table}`);
};

try {
  const department = await first('departments', (query) => query.eq('is_active', true));
  const executive = await createAuthProfile('executive', { role: 'super_admin', department_id: department.id, designation: 'QA Executive' });
  const gm = await createAuthProfile('gm', { role: 'general_manager', department_id: department.id, designation: 'QA General Manager' });
  const finance = await createAuthProfile('finance', { department_id: department.id, designation: 'QA Finance' });
  const psychologist = await createAuthProfile('psychologist', { role: 'psychologist', department_id: department.id, manager_id: gm.id, designation: 'QA Psychologist' });
  const employee = await createAuthProfile('employee', { department_id: department.id, manager_id: gm.id, designation: 'QA Employee' });
  const unauthorized = await createAuthProfile('unauthorized', { department_id: department.id, designation: 'QA Unauthorized' });
  const inactive = await createAuthProfile('inactive', { department_id: department.id, status: 'inactive', designation: 'QA Inactive' });
  const terminated = await createAuthProfile('terminated', { department_id: department.id, status: 'terminated', designation: 'QA Terminated' });
  const external = await createAuthProfile('external', { department_id: department.id, is_employee: false, workforce_visible: false, designation: 'QA External' });
  const onboarding = await createAuthProfile('onboarding', {
    department_id: department.id,
    designation: 'QA Onboarding',
    onboarding_required: true,
    employee_provision_request_id: `local-${run}-onboarding`,
  });

  const users = { executive, gm, finance, psychologist, employee, unauthorized, inactive, terminated, external, onboarding };
  const permissionRows = expectNoError(await service.from('permissions').select('id,code').in('code', ['finance.manage', 'invoices.manage']), 'read finance permissions');
  expectNoError(await service.from('user_permission_grants').insert(permissionRows.map((permission) => ({
    profile_id: finance.id,
    permission_id: permission.id,
    granted_by: executive.id,
    reason: 'Synthetic local Docker QA',
  }))), 'grant finance fixture permissions');

  const clients = {};
  for (const [key, profile] of Object.entries(users)) clients[key] = await signIn(profile);
  pass('real local Auth sessions', `${Object.keys(clients).length} synthetic users`);

  for (const key of ['unauthorized', 'inactive', 'terminated', 'external', 'onboarding']) {
    const allowed = await rpc(clients[key], 'has_permission', { permission_code: 'finance.manage' }, `${key} permission check`);
    assert.equal(allowed, false, `${key} must not have finance.manage`);
  }
  await expectError(anon.rpc('has_permission', { permission_code: 'finance.manage' }), 'anonymous permission denied');
  await expectError(clients.unauthorized.rpc('record_invoice_payment_atomic', {
    target_invoice: crypto.randomUUID(), target_account: crypto.randomUUID(), payment_amount: 1,
    paid_on: '2026-09-28', method: 'cash', reference: marker, request_key: crypto.randomUUID(),
  }), 'unauthorized direct finance RPC denied', /42501|Permission denied/i);
  pass('inactive, terminated, external, and onboarding restrictions');

  const account = await first('finance_accounts', (query) => query.eq('is_active', true));
  const source = await first('crm_lead_sources', (query) => query.eq('is_active', true));
  const leadStatus = await first('crm_lead_statuses', (query) => query.eq('is_active', true));
  const category = await first('finance_expense_categories', (query) => query.eq('is_active', true).neq('name', 'Marketing'));

  const existingStaffDoctor = expectNoError(await service.from('outsourced_doctors').select('*').eq('profile_id', psychologist.id).maybeSingle(), 'read synchronized staff psychologist');
  const staffDoctor = existingStaffDoctor || expectNoError(await service.from('outsourced_doctors').insert({
    doctor_name: `${marker} staff psychologist`, specialization: 'Synthetic QA', qualification: 'Synthetic QA',
    phone: `97150${run.replace(/\D/g, '').padEnd(7, '0').slice(0, 7)}`, email: `${marker.toLowerCase()}-clinician@example.test`,
    status: 'active', profile_id: psychologist.id, clinician_type: 'staff_psychologist', created_by: executive.id,
  }).select('*').single(), 'create staff psychologist link');
  assert.equal(staffDoctor.profile_id, psychologist.id);
  const outsourcedDoctor = expectNoError(await service.from('outsourced_doctors').insert({
    doctor_name: `${marker} outsourced psychologist`, specialization: 'Synthetic QA', qualification: 'Synthetic QA',
    phone: `97155${run.replace(/\D/g, '').padEnd(7, '1').slice(0, 7)}`, email: `${marker.toLowerCase()}-outsourced@example.test`,
    status: 'active', clinician_type: 'outsourced', created_by: executive.id,
  }).select('*').single(), 'create outsourced psychologist');
  expectNoError(await service.from('psychologist_payout_settings').upsert({
    doctor_id: outsourcedDoctor.id, default_session_payout: 800, is_active: true, updated_by: executive.id,
  }, { onConflict: 'doctor_id' }), 'create payout fixture');

  const future = new Date(Date.now() + 14 * 86400000);
  const futureDate = future.toISOString().slice(0, 10);
  const appointmentStart = `${futureDate}T10:00:00+04:00`;
  const appointmentEnd = `${futureDate}T11:00:00+04:00`;
  const futureDay = new Date(appointmentStart).getUTCDay();
  expectNoError(await service.from('doctor_weekly_availability').insert({
    doctor_id: outsourcedDoctor.id, day_of_week: futureDay, start_time: '08:00', end_time: '18:00', created_by: executive.id,
  }), 'create appointment availability');

  const patient = expectNoError(await service.from('patients').insert({
    patient_number: `QA-${run.toUpperCase()}`,
    full_name: `${marker} Client`,
    phone: `97152${run.replace(/\D/g, '').padEnd(7, '2').slice(0, 7)}`,
    email: `${marker.toLowerCase()}-client@example.test`,
    slug: `${marker.toLowerCase()}-client`,
    source: 'other',
    assigned_psychologist_id: psychologist.id,
    created_by: gm.id,
  }).select('*').single(), 'create synthetic patient');

  const leadPhone = `97154${run.replace(/\D/g, '').padEnd(7, '3').slice(0, 7)}`;
  const leadToken = crypto.randomUUID();
  const leadDraftId = await rpc(clients.gm, 'start_genie_workflow_draft', {
    target_conversation: crypto.randomUUID(), target_action_type: 'lead',
    draft_payload: { full_name: `${marker} Lead`, phone: leadPhone, lead_date: '2026-09-28', source_id: source.id, status_id: leadStatus.id, temperature: 'warm' },
    draft_missing_fields: [], target_confirmation_token: leadToken,
  }, 'start Genie lead');
  const leadDraft = expectNoError(await clients.gm.from('genie_workflow_drafts').select('*').eq('id', leadDraftId).single(), 'read Genie lead draft');
  const leadResult = await rpc(clients.gm, 'confirm_genie_action', {
    target_draft: leadDraft.id, expected_version: leadDraft.version, expected_confirmation_token: leadToken, request_key: leadDraft.idempotency_key,
  }, 'confirm Genie lead');
  const leadReplay = await rpc(clients.gm, 'confirm_genie_action', {
    target_draft: leadDraft.id, expected_version: leadDraft.version, expected_confirmation_token: leadToken, request_key: leadDraft.idempotency_key,
  }, 'replay Genie lead');
  assert.equal(leadReplay[0].result_id, leadResult[0].result_id);
  assert.equal(leadReplay[0].replayed, true);
  await expectError(clients.gm.rpc('confirm_genie_action', {
    target_draft: leadDraft.id, expected_version: leadDraft.version, expected_confirmation_token: crypto.randomUUID(), request_key: leadDraft.idempotency_key,
  }), 'Genie changed confirmation payload rejected', /22023|different Genie payload/i);
  pass('Genie lead confirmation and lost-response replay');

  const manualLead = expectNoError(await clients.gm.from('crm_leads').insert({
    lead_date: '2026-09-28', full_name: `${marker} Manual Compatible`, phone: `+${leadPhone.slice(0, 3)} ${leadPhone.slice(3)}`,
    source_id: source.id, status_id: leadStatus.id, assigned_to: gm.id, created_by: gm.id,
  }).select('id').single(), 'manual lead compatibility');
  assert(manualLead.id);
  pass('normalized-phone guard is workflow-scoped; manual lead path remains compatible');
  const converted = await rpc(clients.gm, 'convert_lead_to_patient', {
    target_lead: manualLead.id, requested_patient_number: `CV-${run.toUpperCase()}`,
  }, 'convert lead to patient');
  const convertedPatient = expectNoError(await service.from('patients').select('*').eq('id', converted[0].patient_id).single(), 'read converted patient');
  const convertedLeadBeforeRetry = expectNoError(await service.from('crm_leads').select('converted_at,converted_patient_id').eq('id', manualLead.id).single(), 'read converted lead');
  await expectError(clients.gm.rpc('convert_lead_to_patient', {
    target_lead: manualLead.id, requested_patient_number: `CV-${run.toUpperCase()}`,
  }), 'second lead conversion rejected', /23505|already been converted/i);
  const convertedLeadAfterRetry = expectNoError(await service.from('crm_leads').select('converted_at,converted_patient_id').eq('id', manualLead.id).single(), 'verify converted lead timestamp');
  assert.deepEqual(convertedLeadAfterRetry, convertedLeadBeforeRetry);
  pass('lead conversion is single-use and preserves converted_at');

  const taskToken = crypto.randomUUID();
  const taskDraftId = await rpc(clients.gm, 'start_genie_workflow_draft', {
    target_conversation: crypto.randomUUID(), target_action_type: 'task',
    draft_payload: { title: `${marker} Task`, due_date: '2026-10-15', priority: 'high', assignee_ids: [employee.id], description: 'Synthetic local QA' },
    draft_missing_fields: [], target_confirmation_token: taskToken,
  }, 'start Genie task');
  let taskDraft = expectNoError(await clients.gm.from('genie_workflow_drafts').select('*').eq('id', taskDraftId).single(), 'read Genie task draft');
  await rpc(clients.gm, 'update_genie_workflow_draft', {
    target_draft: taskDraft.id, expected_version: taskDraft.version,
    draft_payload: { ...taskDraft.draft, description: 'Synthetic local QA edited' }, draft_missing_fields: [], target_confirmation_token: taskToken,
  }, 'edit Genie task');
  taskDraft = expectNoError(await clients.gm.from('genie_workflow_drafts').select('*').eq('id', taskDraftId).single(), 'read edited Genie task');
  const taskResult = await rpc(clients.gm, 'confirm_genie_action', {
    target_draft: taskDraft.id, expected_version: taskDraft.version, expected_confirmation_token: taskToken, request_key: taskDraft.idempotency_key,
  }, 'confirm Genie task');
  assert(taskResult[0].result_id);
  const cancelToken = crypto.randomUUID();
  const cancelDraftId = await rpc(clients.gm, 'start_genie_workflow_draft', {
    target_conversation: crypto.randomUUID(), target_action_type: 'task', draft_payload: {}, draft_missing_fields: ['title'], target_confirmation_token: cancelToken,
  }, 'start cancellable Genie task');
  await rpc(clients.gm, 'cancel_genie_workflow_draft', { target_draft: cancelDraftId, expected_version: 1 }, 'cancel Genie workflow');
  pass('Genie task editing, confirmation, and cancellation');

  const expenseToken = crypto.randomUUID();
  const expenseDraftId = await rpc(clients.gm, 'start_genie_workflow_draft', {
    target_conversation: crypto.randomUUID(), target_action_type: 'expense',
    draft_payload: { amount: 125, transaction_date: '2026-09-28', payment_method: 'cash', account_id: account.id, expense_category_id: category.id, description: 'Synthetic local QA expense' },
    draft_missing_fields: [], target_confirmation_token: expenseToken,
  }, 'start Genie expense');
  const expenseDraft = expectNoError(await clients.gm.from('genie_workflow_drafts').select('*').eq('id', expenseDraftId).single(), 'read Genie expense draft');
  const expenseResult = await rpc(clients.gm, 'confirm_genie_action', {
    target_draft: expenseDraft.id, expected_version: expenseDraft.version, expected_confirmation_token: expenseToken, request_key: expenseDraft.idempotency_key,
  }, 'confirm Genie expense');
  assert(expenseResult[0].result_id);
  pass('Genie expense persistence');

  const raceKey = crypto.randomUUID();
  const raceDrafts = [];
  for (const suffix of ['A', 'B']) {
    const token = crypto.randomUUID();
    const id = await rpc(clients.gm, 'start_genie_workflow_draft', {
      target_conversation: crypto.randomUUID(), target_action_type: 'lead',
      draft_payload: { full_name: `${marker} Race ${suffix}`, phone: `${leadPhone.slice(0, -1)}${suffix === 'A' ? '7' : '8'}`, lead_date: '2026-09-28', source_id: source.id, status_id: leadStatus.id, temperature: 'warm' },
      draft_missing_fields: [], target_confirmation_token: token,
    }, `start concurrent Genie lead ${suffix}`);
    raceDrafts.push({ id, token });
  }
  expectNoError(await service.from('genie_workflow_drafts').update({ idempotency_key: raceKey }).in('id', raceDrafts.map((draft) => draft.id)), 'bind concurrent Genie request key');
  const concurrentResults = await Promise.all(raceDrafts.map((draft) => clients.gm.rpc('confirm_genie_action', {
    target_draft: draft.id, expected_version: 1, expected_confirmation_token: draft.token, request_key: raceKey,
  })));
  assert.equal(concurrentResults.filter((result) => !result.error).length, 1);
  assert.equal(concurrentResults.filter((result) => result.error && /22023|different Genie payload/i.test(`${result.error.code} ${result.error.message}`)).length, 1);
  const raceRows = expectNoError(await service.from('crm_leads').select('id').like('full_name', `${marker} Race %`), 'count concurrent Genie records');
  assert.equal(raceRows.length, 1);
  pass('two simultaneous Genie confirmations reserve one operation');

  const sessionOneKey = crypto.randomUUID();
  const sessionOneArgs = {
    target_patient: patient.id, session_at: `${futureDate}T08:00:00+04:00`, target_practitioner: psychologist.id,
    target_session_type: 'Synthetic existing session', target_duration: 60, target_status: 'completed', target_session_number: 1,
    target_follow_up: null, target_summary: 'Synthetic existing received payment', target_fee: 1000, received_amount: 1000,
    receiving_account: account.id, received_method: 'cash', received_reference: `${marker}-R1`, request_key: sessionOneKey,
  };
  const sessionOne = await rpc(clients.gm, 'create_patient_session_with_payment', sessionOneArgs, 'create existing paid session');
  const sessionOneReplay = await rpc(clients.gm, 'create_patient_session_with_payment', sessionOneArgs, 'replay existing paid session');
  assert.equal(sessionOneReplay.id, sessionOne.id);
  await expectError(clients.gm.rpc('create_patient_session_with_payment', { ...sessionOneArgs, target_summary: 'changed' }), 'session changed-payload reuse rejected', /22023|different session payload/i);

  const sessionTwoKey = crypto.randomUUID();
  const sessionTwoArgs = {
    target_patient: patient.id, session_at: `${futureDate}T09:00:00+04:00`, target_practitioner: psychologist.id,
    target_session_type: 'Synthetic new session', target_duration: 60, target_status: 'completed', target_session_number: 2,
    target_follow_up: null, target_summary: 'Synthetic new payment', target_fee: 2000, received_amount: 0,
    receiving_account: null, received_method: null, received_reference: null, request_key: sessionTwoKey,
  };
  const sessionTwo = await rpc(clients.gm, 'create_patient_session_with_payment', sessionTwoArgs, 'create second session');
  const paymentKey = crypto.randomUUID();
  const paymentArgs = { target_invoice: sessionTwo.invoice_id, target_account: account.id, payment_amount: 1500, paid_on: futureDate, method: 'cash', reference: `${marker}-R2`, request_key: paymentKey };
  const payment = await rpc(clients.gm, 'record_invoice_payment_atomic', paymentArgs, 'record INR 1500 payment');
  const paymentReplay = await rpc(clients.gm, 'record_invoice_payment_atomic', paymentArgs, 'replay INR 1500 payment');
  assert.equal(paymentReplay.id, payment.id);
  await expectError(clients.gm.rpc('record_invoice_payment_atomic', { ...paymentArgs, payment_amount: 1499 }), 'payment changed-payload reuse rejected', /22023|different payment payload/i);
  await expectError(clients.finance.rpc('record_invoice_payment_atomic', paymentArgs), 'cross-actor payment replay rejected', /42501|another actor/i);

  const invoices = expectNoError(await service.from('finance_invoices').select('id,status,patient_session_id').eq('patient_id', patient.id), 'read session invoices');
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const items = expectNoError(await service.from('finance_invoice_items').select('invoice_id,quantity,rate').in('invoice_id', invoiceIds), 'read invoice items');
  const payments = expectNoError(await service.from('finance_invoice_payments').select('id,invoice_id,amount,finance_transaction_id').in('invoice_id', invoiceIds), 'read receipts');
  const received = payments.reduce((sum, row) => sum + Number(row.amount), 0);
  const billed = items.reduce((sum, row) => sum + Number(row.quantity) * Number(row.rate), 0);
  assert.equal(received, 2500);
  assert.equal(billed - received, 500);
  assert.equal(payments.length, 2);
  assert(payments.every((row) => row.finance_transaction_id));
  pass('financial invariant', 'received INR 2,500; outstanding INR 500');

  const appointmentKey = crypto.randomUUID();
  const appointmentArgs = {
    target_patient: patient.id, target_doctor: outsourcedDoctor.id, appointment_start: appointmentStart, appointment_end: appointmentEnd,
    appointment_consultation_type: 'in_person', client_session_fee: 1200, appointment_remarks: 'Synthetic local QA', request_key: appointmentKey,
  };
  const appointmentId = await rpc(clients.gm, 'create_doctor_appointment_v2', appointmentArgs, 'create appointment');
  const appointmentReplay = await rpc(clients.gm, 'create_doctor_appointment_v2', appointmentArgs, 'replay appointment');
  assert.equal(appointmentReplay, appointmentId);
  const appointment = expectNoError(await service.from('doctor_appointments').select('*').eq('id', appointmentId).single(), 'read appointment');
  assert.equal(Number(appointment.session_fee), 1200);
  assert.equal(Number(appointment.psychologist_fee_snapshot), 800);
  pass('client fee and practitioner payout separation');

  const previewWithFuture = (await rpc(clients.executive, 'patient_archive_preview', { target_patient: patient.id }, 'archive preview with future appointment'))[0];
  assert.equal(Number(previewWithFuture.future_appointments), 1);
  await expectError(clients.executive.rpc('archive_patient', { target_patient: patient.id, reason: 'Synthetic QA', acknowledge_outstanding: true }), 'archive blocked by future appointment', /future appointments/i);
  await rpc(clients.gm, 'update_doctor_appointment_v2', {
    target_appointment: appointmentId, target_doctor: outsourcedDoctor.id, appointment_start: appointmentStart, appointment_end: appointmentEnd,
    appointment_consultation_type: 'in_person', next_status: 'cancelled', client_session_fee: 1200, appointment_remarks: 'Synthetic QA cancelled',
  }, 'cancel future appointment');
  await expectError(clients.executive.rpc('archive_patient', { target_patient: patient.id, reason: 'Synthetic QA', acknowledge_outstanding: false }), 'archive requires outstanding acknowledgement', /Outstanding payments/i);
  const archivedId = await rpc(clients.executive, 'archive_patient', { target_patient: patient.id, reason: 'Synthetic local QA archive', acknowledge_outstanding: true }, 'archive patient');
  assert.equal(archivedId, patient.id);
  await expectError(clients.gm.rpc('create_patient_session_with_payment', sessionOneArgs), 'archived client session replay denied', /Active client not found|Permission denied/i);
  await expectError(clients.gm.rpc('create_doctor_appointment_v2', { ...appointmentArgs, request_key: crypto.randomUUID(), appointment_start: `${futureDate}T12:00:00+04:00`, appointment_end: `${futureDate}T13:00:00+04:00` }), 'archived client appointment denied', /42501|Permission denied/i);
  const archivedPicker = await rpc(clients.gm, 'appointment_patient_options', { search_text: marker, page_offset: 0, page_size: 40, selected_patient: patient.id }, 'appointment picker while archived');
  assert.equal(archivedPicker.some((row) => row.id === patient.id), false);
  const restoredId = await rpc(clients.executive, 'restore_patient', { target_patient: patient.id, reason: 'Synthetic local QA restore' }, 'restore patient');
  assert.equal(restoredId, patient.id);
  const restoredPicker = await rpc(clients.gm, 'appointment_patient_options', { search_text: marker, page_offset: 0, page_size: 40, selected_patient: patient.id }, 'appointment picker after restore');
  assert.equal(restoredPicker[0].id, patient.id);
  const archiveEvents = expectNoError(await service.from('patient_archive_events').select('action,patient_id').eq('patient_id', patient.id).order('created_at'), 'read archive events');
  assert.deepEqual(archiveEvents.map((event) => event.action), ['archived', 'restored']);
  pass('archive, mutation denial, history retention, and same-ID restore');

  const extraPatients = Array.from({ length: 45 }, (_, index) => ({
    patient_number: `QA-${run.toUpperCase()}-${String(index).padStart(2, '0')}`,
    full_name: `${marker} Search ${String(index).padStart(2, '0')}`,
    phone: `970${String(index).padStart(9, '0')}`,
    slug: `${marker.toLowerCase()}-search-${index}`,
    source: 'other', created_by: gm.id,
  }));
  expectNoError(await service.from('patients').insert(extraPatients), 'create >40 search fixtures');
  const secondPage = await rpc(clients.gm, 'appointment_patient_options', { search_text: `${marker} Search`, page_offset: 40, page_size: 40, selected_patient: null }, 'search beyond 40 clients');
  assert.equal(secondPage.length, 5);
  const convertedPicker = await rpc(clients.gm, 'appointment_patient_options', { search_text: `${marker} Search`, page_offset: 0, page_size: 40, selected_patient: convertedPatient.id }, 'find converted client in appointment options');
  assert.equal(convertedPicker[0].id, convertedPatient.id);
  pass('converted client appointment search beyond 40 rows');

  const profileBeforeRoleChange = expectNoError(await service.from('profiles').select('role').eq('id', gm.id).single(), 'read GM role');
  expectNoError(await service.from('profiles').update({ role: 'staff' }).eq('id', gm.id), 'revoke GM role');
  await expectError(clients.gm.rpc('create_patient_session_with_payment', sessionOneArgs), 'session replay after permission loss denied', /42501|Permission denied/i);
  expectNoError(await service.from('profiles').update({ role: profileBeforeRoleChange.role }).eq('id', gm.id), 'restore GM role');
  pass('current authorization rechecked on replay');

  await expectError(clients.onboarding.from('profiles').update({ onboarding_required: false }).eq('id', onboarding.id), 'onboarding state direct update denied', /42501|service-managed|permission/i);
  const nextPassword = `${password}-completed`;
  expectNoError(await clients.onboarding.auth.updateUser({ password: nextPassword }), 'update onboarding password');
  await rpc(service, 'complete_employee_onboarding', { target_profile: onboarding.id }, 'complete onboarding through service RPC');
  const completedOnboarding = expectNoError(await service.from('profiles').select('onboarding_required,onboarding_completed_at').eq('id', onboarding.id).single(), 'read completed onboarding');
  assert.equal(completedOnboarding.onboarding_required, false);
  assert(completedOnboarding.onboarding_completed_at);
  await signIn(onboarding, nextPassword);
  pass('confirmed Auth password onboarding and non-bypassable state transition');

  const originalPaymentIdentity = payments.map((row) => ({ id: row.id, finance_transaction_id: row.finance_transaction_id })).sort((a, b) => a.id.localeCompare(b.id));
  const finalPayments = expectNoError(await service.from('finance_invoice_payments').select('id,finance_transaction_id').in('invoice_id', invoiceIds), 'verify receipt identities');
  assert.deepEqual(finalPayments.sort((a, b) => a.id.localeCompare(b.id)), originalPaymentIdentity);
  pass('receipt and ledger transaction IDs remained unchanged');

  report.fixture = {
    users: Object.fromEntries(Object.entries(users).map(([key, value]) => [key, { id: value.id, email: value.email }])),
    patient: { id: patient.id, slug: patient.slug, patientNumber: patient.patient_number },
    convertedPatient: { id: convertedPatient.id, slug: convertedPatient.slug, patientNumber: convertedPatient.patient_number },
    invoiceIds,
    appointmentId,
    leadId: leadResult[0].result_id,
    taskId: taskResult[0].result_id,
    expenseId: expenseResult[0].result_id,
  };
  report.organizationModel = 'single-tenant Supabase project; no organization_id/tenant_id exists; department/branch are workforce dimensions';
  report.finishedAt = new Date().toISOString();
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(`${evidenceDir}/qualification-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${evidenceDir}/browser-fixture.json`, `${JSON.stringify(report.fixture, null, 2)}\n`);
  console.log(`RESULT ${report.checks.length} checks passed`);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.failure = error instanceof Error ? error.message : String(error);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(`${evidenceDir}/qualification-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`FAIL ${report.failure}`);
  process.exitCode = 1;
}
