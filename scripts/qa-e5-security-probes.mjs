import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';

const required = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const url = required('BSMILE_QA_SUPABASE_URL');
const anonKey = required('BSMILE_QA_SUPABASE_ANON_KEY');
const serviceKey = required('BSMILE_QA_SUPABASE_SERVICE_ROLE_KEY');
const projectRef = required('BSMILE_QA_PROJECT_REF');
if (projectRef !== 'enylrvmjgbntkrgpqsfe' || new URL(url).hostname !== 'enylrvmjgbntkrgpqsfe.supabase.co') throw new Error('E5 probes require the verified QA project');

const client = key => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const fixtureAdmin = client(serviceKey);
const results = [];
const cleanup = { users: [], leadId: undefined, documentIds: [], documentPaths: [], meetingId: undefined, patientIds: [], patientDocumentIds: [], patientPaths: [] };
const errorMessage = error => error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'unknown';
const check = async (name, fn) => { try { await fn(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: errorMessage(error) }); } };
const mustFail = (result, label) => { if (!result.error) throw new Error(`${label} unexpectedly succeeded`); };
const signIn = async credentials => { const db = client(anonKey); const signed = await db.auth.signInWithPassword(credentials); if (signed.error || !signed.data.user) throw signed.error || new Error('Fixture sign-in failed'); return { db, user: signed.data.user }; };

async function createFixture(label, profile) {
  const email = `e5-${label}-${crypto.randomUUID()}@qa.bsmile.local`;
  const password = `${crypto.randomUUID()}Aa9!`;
  const created = await fixtureAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error || new Error(`Could not create ${label} fixture`);
  cleanup.users.push(created.data.user.id);
  const saved = await fixtureAdmin.from('profiles').upsert({ id: created.data.user.id, email, status: 'active', is_employee: true, workforce_visible: true, ...profile });
  if (saved.error) throw saved.error;
  return { id: created.data.user.id, email, password };
}

let assistant;
let psychologist;
let psychologistName;
let participantB;
let employee;
let gm;
try {
  const department = await fixtureAdmin.from('departments').select('id').eq('name', 'Administration').single();
  if (department.error) throw department.error;
  assistant = await createFixture('assistant', { full_name: 'QA E5 Assistant Manager', role: 'staff', designation: 'Assistant Manager', department_id: department.data.id });
  psychologistName = `QA E5 Psychologist ${crypto.randomUUID().slice(0, 8)}`;
  psychologist = await createFixture('psychologist', { full_name: psychologistName, role: 'psychologist', designation: 'Psychologist' });
  participantB = await createFixture('participant-b', { full_name: 'QA E5 Participant B', role: 'staff', designation: 'Employee', department_id: department.data.id });
  employee = await signIn({ email: required('BSMILE_QA_EMPLOYEE_EMAIL'), password: required('BSMILE_QA_EMPLOYEE_PASSWORD') });
  gm = await signIn({ email: required('BSMILE_QA_GENERAL_MANAGER_EMAIL'), password: required('BSMILE_QA_GENERAL_MANAGER_PASSWORD') });
  const assistantSession = await signIn(assistant);
  const psychologistSession = await signIn(psychologist);
  const participantBSession = await signIn(participantB);

  await check('Assistant Manager receives the canonical operational CRM bundle without security administration', async () => {
    for (const code of ['admin.shell', 'crm.manage_all', 'crm.import', 'leads.create', 'leads.edit', 'leads.assign', 'leads.manage_status', 'sales.view', 'sales.edit', 'documents.employee.view', 'documents.official.generate']) {
      const permission = await assistantSession.db.rpc('has_permission', { permission_code: code });
      if (permission.error || permission.data !== true) throw new Error(`Missing Assistant Manager permission: ${code}`);
    }
    for (const code of ['roles.manage', 'permissions.manage', 'settings.manage', 'crm.delete', 'documents.manage', 'documents.employee.manage']) {
      const permission = await assistantSession.db.rpc('has_permission', { permission_code: code });
      if (permission.error || permission.data !== false) throw new Error(`Protected permission exposed: ${code}`);
    }
  });

  await check('Assistant Manager official employee search returns only bounded operational fields, not private profiles', async () => {
    const direct = await assistantSession.db.from('profiles').select('id').eq('id', psychologist.id);
    if (direct.error || direct.data?.length) throw direct.error || new Error('Broad employee profiles SELECT was exposed');
    const searched = await assistantSession.db.rpc('search_official_document_employees', { search_text: psychologistName });
    if (searched.error || searched.data?.length !== 1 || searched.data[0].id !== psychologist.id) throw searched.error || new Error('Scoped official employee search failed');
    const selectable = await assistantSession.db.rpc('official_document_employee_is_selectable', { target_profile: psychologist.id });
    if (selectable.error || selectable.data !== true) throw selectable.error || new Error('Canonical employee relation unavailable');
    const wildcards = await assistantSession.db.rpc('search_official_document_employees', { search_text: '__' });
    if (wildcards.error || wildcards.data?.length) throw wildcards.error || new Error('Wildcard search exposed employee directory');
    const unauthorized = await employee.db.rpc('search_official_document_employees', { search_text: 'QA E5' });
    if (unauthorized.error || unauthorized.data?.length) throw unauthorized.error || new Error('Unauthorized employee searched workforce');
  });

  await check('Assistant Manager cannot create restricted official metadata or upload outside their own official PDF path', async () => {
    const forbidden = await assistantSession.db.from('documents').insert({
      title: 'QA denied salary slip', category: 'Official:Salary Slip', source_type: 'official_generated',
      document_type: 'salary_slip', official_status: 'available',
      storage_path: `company/${assistant.id}/official/${crypto.randomUUID()}.pdf`,
      file_name: 'denied.pdf', mime_type: 'application/pdf', file_size: 8,
      uploaded_by: assistant.id,
    });
    mustFail(forbidden, 'restricted salary slip');
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
    mustFail(await assistantSession.db.storage.from('employee-documents').upload(`company/${assistant.id}/private/${crypto.randomUUID()}.pdf`, bytes, { contentType: 'application/pdf' }), 'non-official company upload');
    mustFail(await assistantSession.db.storage.from('employee-documents').upload(`company/${gm.user.id}/official/${crypto.randomUUID()}.pdf`, bytes, { contentType: 'application/pdf' }), 'another owner official upload');
    mustFail(await employee.db.storage.from('employee-documents').upload(`company/${employee.user.id}/official/${crypto.randomUUID()}.pdf`, bytes, { contentType: 'application/pdf' }), 'unauthorized employee official upload');
  });

  await check('Assistant Manager Lead to Sale conversion is atomic, amount-preserving and idempotent', async () => {
    const [source, status] = await Promise.all([
      assistantSession.db.from('crm_lead_sources').select('id').eq('is_active', true).limit(1).single(),
      assistantSession.db.from('crm_lead_statuses').select('id').eq('is_active', true).order('sort_order').limit(1).single(),
    ]);
    if (source.error || status.error) throw source.error || status.error;
    const lead = await assistantSession.db.from('crm_leads').insert({ full_name: 'QA E5 Conversion', phone: `E5-${Date.now()}`, source_id: source.data.id, status_id: status.data.id, assigned_to: assistant.id, created_by: assistant.id }).select('id').single();
    if (lead.error) throw lead.error;
    cleanup.leadId = lead.data.id;
    const amount = 4321.75;
    const first = await assistantSession.db.rpc('convert_crm_lead_to_sale', { target_lead: lead.data.id, sale_amount: amount, sale_currency: 'INR', sale_closing_date: new Date().toISOString().slice(0, 10) });
    if (first.error || Number(first.data?.sale_value) !== amount) throw first.error || new Error('Conversion amount mismatch');
    const retried = await assistantSession.db.rpc('convert_crm_lead_to_sale', { target_lead: lead.data.id, sale_amount: 9999, sale_currency: 'INR', sale_closing_date: new Date().toISOString().slice(0, 10) });
    if (retried.error || retried.data?.id !== first.data?.id || Number(retried.data?.sale_value) !== amount) throw retried.error || new Error('Conversion retry duplicated or changed the sale');
    const persisted = await assistantSession.db.from('crm_leads').select('converted_at,crm_sales(id,sale_value)').eq('id', lead.data.id).single();
    const relatedSales = Array.isArray(persisted.data?.crm_sales)
      ? persisted.data.crm_sales
      : persisted.data?.crm_sales ? [persisted.data.crm_sales] : [];
    if (persisted.error || !persisted.data.converted_at || relatedSales.length !== 1 || Number(relatedSales[0].sale_value) !== amount) throw persisted.error || new Error('Converted state did not persist');
  });

  await check('Unauthorized employee and anonymous callers cannot convert leads', async () => {
    mustFail(await employee.db.rpc('convert_crm_lead_to_sale', { target_lead: cleanup.leadId, sale_amount: 1, sale_currency: 'INR', sale_closing_date: new Date().toISOString().slice(0, 10) }), 'employee conversion');
    mustFail(await client(anonKey).rpc('convert_crm_lead_to_sale', { target_lead: cleanup.leadId, sale_amount: 1, sale_currency: 'INR', sale_closing_date: new Date().toISOString().slice(0, 10) }), 'anonymous conversion');
  });

  await check('Assistant Manager can view and download only intended official documents', async () => {
    const sharedPath = `company/e5/${crypto.randomUUID()}.pdf`;
    const restrictedPath = `company/e5/${crypto.randomUUID()}.pdf`;
    const uploaded = await fixtureAdmin.storage.from('employee-documents').upload(sharedPath, new Uint8Array([37,80,68,70,45,49,46,52]), { contentType: 'application/pdf' });
    const restrictedUpload = await fixtureAdmin.storage.from('employee-documents').upload(restrictedPath, new Uint8Array([37,80,68,70,45,49,46,52]), { contentType: 'application/pdf' });
    if (uploaded.error || restrictedUpload.error) throw uploaded.error || restrictedUpload.error;
    cleanup.documentPaths.push(sharedPath, restrictedPath);
    const rows = await fixtureAdmin.from('documents').insert([
      { title: 'QA E5 Shared Policy', category: 'Policy', storage_path: sharedPath, file_name: 'shared.pdf', mime_type: 'application/pdf', file_size: 8, uploaded_by: gm.user.id },
      { title: 'QA E5 Restricted Policy', category: 'Policy', storage_path: restrictedPath, file_name: 'restricted.pdf', mime_type: 'application/pdf', file_size: 8, uploaded_by: gm.user.id },
    ]).select('id,storage_path');
    if (rows.error) throw rows.error;
    cleanup.documentIds.push(...rows.data.map(row => row.id));
    const shared = rows.data.find(row => row.storage_path === sharedPath);
    const share = await fixtureAdmin.from('document_shares').insert({ document_id: shared.id, profile_id: assistant.id, shared_with_all: false });
    if (share.error) throw share.error;
    const visible = await assistantSession.db.from('documents').select('id,storage_path').in('id', cleanup.documentIds);
    if (visible.error || visible.data.length !== 1 || visible.data[0].id !== shared.id) throw visible.error || new Error('Official document audience boundary failed');
    const signed = await assistantSession.db.storage.from('employee-documents').createSignedUrl(sharedPath, 60);
    if (signed.error || !signed.data.signedUrl) throw signed.error || new Error('Shared official document download failed');
    mustFail(await assistantSession.db.storage.from('employee-documents').createSignedUrl(restrictedPath, 60), 'restricted official document download');
  });

  await check('Meeting participant can add an attributed note and authorized viewers can read it', async () => {
    const hosts = await gm.db.rpc('meeting_hosts');
    if (hosts.error || !hosts.data?.length) throw hosts.error || new Error('No meeting host available');
    const start = new Date(Date.now() + 70 * 86400_000);
    const meeting = await gm.db.rpc('save_meeting', { target_meeting: null, host_profile_id: hosts.data[0].id, meeting_title: 'QA E5 Notes', meeting_agenda: 'Verify shared attributed notes', meeting_start: start.toISOString(), meeting_end: new Date(+start + 3600000).toISOString(), meeting_type_value: 'office', meeting_venue: '', meeting_url_value: '', meeting_description: '', participant_ids: [employee.user.id, participantB.id] });
    if (meeting.error) throw meeting.error;
    cleanup.meetingId = meeting.data;
    const inserted = await employee.db.from('meeting_note_entries').insert({ meeting_id: meeting.data, author_profile_id: employee.user.id, content: 'QA E5 attributed participant note' }).select('id,content,created_at,author:profiles!meeting_note_entries_author_profile_id_fkey(full_name)').single();
    if (inserted.error || !inserted.data.created_at || !inserted.data.author?.full_name) throw inserted.error || new Error('Meeting note attribution missing');
    const viewed = await gm.db.from('meeting_note_entries').select('id,author_profile_id,content').eq('id', inserted.data.id).single();
    if (viewed.error || viewed.data.author_profile_id !== employee.user.id) throw viewed.error || new Error('Authorized meeting note read failed');
  });

  await check('A second meeting participant sees the original author name without broader profile visibility', async () => {
    const authorProfile = await fixtureAdmin.from('profiles').select('full_name').eq('id', employee.user.id).single();
    if (authorProfile.error) throw authorProfile.error;
    const profileRead = await participantBSession.db.from('profiles').select('id').eq('id', employee.user.id);
    if (profileRead.error || profileRead.data.length) throw profileRead.error || new Error('Unrelated profile visibility broadened');
    const shared = await participantBSession.db.rpc('meeting_note_entries_for_visible_meeting', { target_meeting: cleanup.meetingId });
    if (shared.error || shared.data.length !== 1 || shared.data[0].author?.full_name !== authorProfile.data.full_name) throw shared.error || new Error('Meeting note author was not visible to the authorized second participant');
    const unrelated = await assistantSession.db.rpc('meeting_note_entries_for_visible_meeting', { target_meeting: cleanup.meetingId });
    if (unrelated.error || unrelated.data.length) throw unrelated.error || new Error('Meeting-scoped author display leaked to unrelated staff');
    mustFail(await client(anonKey).rpc('meeting_note_entries_for_visible_meeting', { target_meeting: cleanup.meetingId }), 'anonymous author display');
  });

  await check('Unrelated Assistant Manager and anonymous callers cannot read or add meeting notes', async () => {
    const unrelated = await assistantSession.db.from('meeting_note_entries').select('id').eq('meeting_id', cleanup.meetingId);
    if (unrelated.error || unrelated.data.length) throw unrelated.error || new Error('Unrelated meeting notes became visible');
    mustFail(await assistantSession.db.from('meeting_note_entries').insert({ meeting_id: cleanup.meetingId, author_profile_id: assistant.id, content: 'Denied' }), 'unrelated meeting note');
    mustFail(await client(anonKey).from('meeting_note_entries').select('id').eq('meeting_id', cleanup.meetingId), 'anonymous meeting note read');
  });

  await check('Psychologist has complete document lifecycle only for the assigned client', async () => {
    const assigned = await fixtureAdmin.from('patients').insert({ patient_number: `E5-A-${crypto.randomUUID()}`, full_name: 'QA E5 Assigned Client', status: 'active', source: 'Other', assigned_psychologist_id: psychologist.id, created_by: gm.user.id }).select('id').single();
    const foreign = await fixtureAdmin.from('patients').insert({ patient_number: `E5-F-${crypto.randomUUID()}`, full_name: 'QA E5 Foreign Client', status: 'active', source: 'Other', assigned_psychologist_id: employee.user.id, created_by: gm.user.id }).select('id').single();
    if (assigned.error || foreign.error) throw assigned.error || foreign.error;
    cleanup.patientIds.push(assigned.data.id, foreign.data.id);
    const visible = await psychologistSession.db.from('patients').select('id').in('id', cleanup.patientIds);
    if (visible.error || visible.data.length !== 1 || visible.data[0].id !== assigned.data.id) throw visible.error || new Error('Psychologist patient assignment boundary failed');
    const pendingKey = `pending-${crypto.randomUUID()}`;
    const document = await psychologistSession.db.from('patient_documents').insert({ patient_id: assigned.data.id, document_name: 'QA E5 Standard Document', original_filename: 'e5.pdf', category: 'Other', visibility: 'assigned_psychologist', mime_type: 'application/pdf', file_extension: 'pdf', file_size_bytes: 8, uploaded_by: psychologist.id, storage_key: pendingKey }).select('id').single();
    if (document.error) throw document.error;
    cleanup.patientDocumentIds.push(document.data.id);
    const path = `patients/${assigned.data.id}/documents/${document.data.id}/v1/${crypto.randomUUID()}.pdf`;
    const upload = await psychologistSession.db.storage.from('patient-documents').upload(path, new Uint8Array([37,80,68,70,45,49,46,52]), { contentType: 'application/pdf' });
    if (upload.error) throw upload.error;
    cleanup.patientPaths.push(path);
    const finalized = await psychologistSession.db.from('patient_documents').update({ storage_key: path, updated_by: psychologist.id }).eq('id', document.data.id).select('id').single();
    if (finalized.error) throw finalized.error;
    const signed = await psychologistSession.db.storage.from('patient-documents').createSignedUrl(path, 60);
    if (signed.error || !signed.data.signedUrl) throw signed.error || new Error('Assigned client document download failed');
    mustFail(await psychologistSession.db.from('patient_documents').insert({ patient_id: foreign.data.id, document_name: 'Denied', original_filename: 'denied.pdf', category: 'Other', visibility: 'assigned_psychologist', mime_type: 'application/pdf', file_extension: 'pdf', file_size_bytes: 8, uploaded_by: psychologist.id, storage_key: `pending-${crypto.randomUUID()}` }), 'foreign patient document insert');
  });

  await check('Psychologist note, session and activity reads stay assigned-client scoped without anonymous table access', async () => {
    const [assignedId, foreignId] = cleanup.patientIds;
    for (const code of ['patient_notes.view', 'clinical_notes.view', 'patient_activity.view', 'patient_sessions.create']) {
      const permission = await psychologistSession.db.rpc('has_permission', { permission_code: code });
      if (permission.error || permission.data !== true) throw permission.error || new Error(`Psychologist lacks canonical ${code} permission`);
    }
    for (const table of ['patient_notes', 'patient_sessions', 'patient_activity_logs']) {
      const assigned = await psychologistSession.db.from(table).select('id').eq('patient_id', assignedId);
      if (assigned.error) throw assigned.error;
      const foreign = await psychologistSession.db.from(table).select('id').eq('patient_id', foreignId);
      if (foreign.error || foreign.data.length) throw foreign.error || new Error(`${table} disclosed an unauthorized client`);
      mustFail(await client(anonKey).from(table).select('id').eq('patient_id', assignedId), `anonymous ${table} read`);
    }
  });

  await check('Psychologist can write assigned-client notes and sessions while foreign-client mutations remain denied', async () => {
    const [assignedId, foreignId] = cleanup.patientIds;
    const session = await psychologistSession.db.from('patient_sessions').insert({ patient_id: assignedId, appointment_at: new Date(Date.now() + 86400000).toISOString(), assigned_psychologist_id: psychologist.id, created_by: psychologist.id }).select('id').single();
    if (session.error) throw session.error;
    const note = await psychologistSession.db.from('patient_notes').insert({ patient_id: assignedId, note_type: 'clinical', visibility: 'assigned_psychologist', content: 'QA E5 synthetic fixture note', created_by: psychologist.id, related_session_id: session.data.id }).select('id').single();
    if (note.error) throw note.error;
    const sessionUpdate = await psychologistSession.db.from('patient_sessions').update({ attendance_status: 'rescheduled' }).eq('id', session.data.id).select('attendance_status').single();
    if (sessionUpdate.error || sessionUpdate.data.attendance_status !== 'rescheduled') throw sessionUpdate.error || new Error('Assigned-client session update failed');
    const noteUpdate = await psychologistSession.db.from('patient_notes').update({ content: 'QA E5 synthetic fixture note updated', updated_by: psychologist.id }).eq('id', note.data.id).select('content').single();
    if (noteUpdate.error || !noteUpdate.data.content.endsWith('updated')) throw noteUpdate.error || new Error('Assigned-client clinical note update failed');
    const activity = await psychologistSession.db.from('patient_activity_logs').select('action').eq('patient_id', assignedId).in('entity_id', [session.data.id, note.data.id]);
    if (activity.error || !activity.data.some(row => row.action === 'session_created') || !activity.data.some(row => row.action === 'note_created')) throw activity.error || new Error('Assigned-client activity history did not record real mutations');
    mustFail(await psychologistSession.db.from('patient_sessions').insert({ patient_id: foreignId, appointment_at: new Date(Date.now() + 86400000).toISOString(), assigned_psychologist_id: psychologist.id, created_by: psychologist.id }), 'foreign patient session insert');
    mustFail(await psychologistSession.db.from('patient_notes').insert({ patient_id: foreignId, note_type: 'clinical', content: 'Denied QA fixture note', created_by: psychologist.id }), 'foreign patient note insert');
  });

  await check('Psychologist cannot bypass patient scope through Storage or read management-only documents', async () => {
    const [assignedId, foreignId] = cleanup.patientIds;
    const forgedDocumentId = crypto.randomUUID();
    const forgedPath = `patients/${foreignId}/documents/${forgedDocumentId}/v1/${crypto.randomUUID()}.pdf`;
    mustFail(await psychologistSession.db.storage.from('patient-documents').upload(forgedPath, new Uint8Array([1]), { contentType: 'application/pdf' }), 'foreign patient Storage upload');
    const management = await fixtureAdmin.from('patient_documents').insert({ patient_id: assignedId, document_name: 'QA E5 Management Only', original_filename: 'management.pdf', category: 'Other', visibility: 'management_only', mime_type: 'application/pdf', file_extension: 'pdf', file_size_bytes: 8, uploaded_by: gm.user.id, storage_key: `patients/${assignedId}/documents/${crypto.randomUUID()}/v1/management.pdf` }).select('id').single();
    if (management.error) throw management.error;
    cleanup.patientDocumentIds.push(management.data.id);
    const hidden = await psychologistSession.db.from('patient_documents').select('id').eq('id', management.data.id);
    if (hidden.error || hidden.data.length) throw hidden.error || new Error('Management-only document became visible to Psychologist');
  });
} finally {
  if (cleanup.patientPaths.length) await fixtureAdmin.storage.from('patient-documents').remove(cleanup.patientPaths);
  if (cleanup.patientIds.length) {
    await fixtureAdmin.from('patient_activity_logs').delete().in('patient_id', cleanup.patientIds);
    await fixtureAdmin.from('patient_notes').delete().in('patient_id', cleanup.patientIds);
    await fixtureAdmin.from('patient_sessions').delete().in('patient_id', cleanup.patientIds);
  }
  if (cleanup.patientDocumentIds.length) await fixtureAdmin.from('patient_documents').delete().in('id', cleanup.patientDocumentIds);
  if (cleanup.patientIds.length) await fixtureAdmin.from('patients').delete().in('id', cleanup.patientIds);
  if (cleanup.meetingId) {
    await fixtureAdmin.from('meeting_note_entries').delete().eq('meeting_id', cleanup.meetingId);
    await fixtureAdmin.from('meeting_events').delete().eq('meeting_id', cleanup.meetingId);
    await fixtureAdmin.from('meeting_participants').delete().eq('meeting_id', cleanup.meetingId);
    await fixtureAdmin.from('meetings').delete().eq('id', cleanup.meetingId);
  }
  if (cleanup.documentIds.length) {
    await fixtureAdmin.from('document_shares').delete().in('document_id', cleanup.documentIds);
    await fixtureAdmin.from('documents').delete().in('id', cleanup.documentIds);
  }
  if (cleanup.documentPaths.length) await fixtureAdmin.storage.from('employee-documents').remove(cleanup.documentPaths);
  if (cleanup.leadId) {
    await fixtureAdmin.from('crm_sales').delete().eq('lead_id', cleanup.leadId);
    await fixtureAdmin.from('crm_lead_followups').delete().eq('lead_id', cleanup.leadId);
    await fixtureAdmin.from('crm_leads').delete().eq('id', cleanup.leadId);
  }
  for (const id of cleanup.users.reverse()) await fixtureAdmin.auth.admin.deleteUser(id);
}

const failed = results.filter(result => result.status === 'FAIL');
const report = { qaProjectRef: projectRef, total: results.length, passed: results.length - failed.length, failed: failed.length, results };
mkdirSync('release-evidence', { recursive: true });
writeFileSync('release-evidence/security-e5-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
