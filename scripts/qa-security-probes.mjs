import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { verifyCrmArchive } from './qa-crm-archive-probes.mjs';

const required = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const url = required('BSMILE_QA_SUPABASE_URL');
const key = required('BSMILE_QA_SUPABASE_ANON_KEY');
const expectedRef = required('BSMILE_QA_PROJECT_REF');
const actualRef = new URL(url).hostname.split('.')[0];
if (actualRef !== expectedRef || actualRef === 'ksmqzxncdvuxiabypjth') throw new Error('Security probes require the verified non-production QA project');
const account = role => ({ email: required(`BSMILE_QA_${role}_EMAIL`), password: required(`BSMILE_QA_${role}_PASSWORD`) });
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const errorMessage = error => error instanceof Error ? error.message : (error && typeof error === 'object' && 'message' in error ? String(error.message) : 'unknown');
const check = async (name, fn) => { try { await fn(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', error: errorMessage(error) }); } };
const signed = async role => { const db = client(); const { error } = await db.auth.signInWithPassword(account(role)); if (error) throw error; return db; };
const mustFail = (error, label) => { if (!error) throw new Error(`${label} unexpectedly succeeded`); };

async function assertAuthorizedTaskCreation(role) {
  const db = await signed(role);
  const { data: { user } } = await db.auth.getUser();
  const employeeDb = await signed('EMPLOYEE');
  const { data: { user: employee } } = await employeeDb.auth.getUser();
  if (!user || !employee) throw new Error('QA fixtures missing');
  const inserted = await db.from('tasks').insert({ title: `RELEASE_GATE_${role}_${Date.now()}`, description: 'Automated QA security probe', priority: 'low', status: 'todo', created_by: user.id, assignee_id: employee.id }).select('id,created_by').single();
  if (inserted.error || !inserted.data) throw inserted.error || new Error('task not returned');
  try {
    const assignment = await db.from('task_assignments').insert({ task_id: inserted.data.id, profile_id: employee.id, status: 'todo' }).select('id,profile_id').single();
    if (assignment.error || !assignment.data) throw assignment.error || new Error('assignment not returned');
    if (inserted.data.created_by !== user.id) throw new Error('creator mismatch');
    if (assignment.data.profile_id !== employee.id) throw new Error('assignee mismatch');
  } finally {
    await db.from('task_assignments').delete().eq('task_id', inserted.data.id);
    await db.from('tasks').delete().eq('id', inserted.data.id);
  }
}

await check('QA project identity is non-production', async () => { if (actualRef !== expectedRef) throw new Error('QA project ref mismatch'); });
await check('four distinct authenticated role fixtures', async () => { const identities = []; for (const role of ['ADMIN', 'GENERAL_MANAGER', 'MANAGER', 'EMPLOYEE']) { const db = await signed(role); const { data: { user } } = await db.auth.getUser(); if (!user) throw new Error(`${role} fixture missing`); identities.push(user.id); } if (new Set(identities).size !== 4) throw new Error('Role fixtures must be distinct users'); });
await check('Manager fixture uses canonical profile and task permissions', async () => { const db = await signed('MANAGER'); const { data: { user } } = await db.auth.getUser(); const profile = await db.from('profiles').select('role,status').eq('id', user?.id).single(); if (profile.error) throw profile.error; if (profile.data.role !== 'staff' || profile.data.status !== 'active') throw new Error('Manager must be an active staff profile'); const permissions = await Promise.all(['tasks.assign', 'tasks.manage'].map(code => db.rpc('has_permission', { permission_code: code }))); if (permissions.some(result => result.error || result.data !== true)) throw new Error('Manager task permission missing'); const admin = await signed('ADMIN'); const reports = await admin.from('profiles').select('id').eq('manager_id', user?.id).limit(1); if (reports.error || !reports.data?.length) throw reports.error || new Error('Manager has no QA direct report'); });
await check('anonymous task creation denied', async () => mustFail((await client().from('tasks').insert({ title: 'RLS anonymous probe', priority: 'low', status: 'todo' })).error, 'anonymous task insert'));
await check('anonymous completion RPC denied', async () => mustFail((await client().rpc('complete_task_with_update', { target_assignment: crypto.randomUUID(), completion_body: 'probe' })).error, 'anonymous completion'));
await check('anonymous appointment creation denied with the variable-fee contract', async () => mustFail((await client().rpc('create_doctor_appointment', { target_patient: crypto.randomUUID(), target_doctor: crypto.randomUUID(), appointment_start: new Date(Date.now() + 86400_000).toISOString(), appointment_end: new Date(Date.now() + 90000_000).toISOString(), appointment_consultation_type: 'in_person', appointment_fee: 100, appointment_remarks: 'probe' })).error, 'anonymous appointment creation'));
await check('employee appointment creation remains permission-scoped', async () => { const db = await signed('EMPLOYEE'); mustFail((await db.rpc('create_doctor_appointment', { target_patient: crypto.randomUUID(), target_doctor: crypto.randomUUID(), appointment_start: new Date(Date.now() + 86400_000).toISOString(), appointment_end: new Date(Date.now() + 90000_000).toISOString(), appointment_consultation_type: 'in_person', appointment_fee: 100, appointment_remarks: 'probe' })).error, 'employee appointment creation'); });
await check('employee patient creation remains permission-scoped', async () => { const db = await signed('EMPLOYEE'); const { data: { user } } = await db.auth.getUser(); mustFail((await db.from('patients').insert({ patient_number: `DENIED-${Date.now()}`, full_name: 'Denied fixture', status: 'active', source: 'Other', created_by: user?.id })).error, 'employee patient creation'); });
await check('authorized Admin creates and assigns task', async () => assertAuthorizedTaskCreation('ADMIN'));
await check('authorized General Manager creates and assigns task', async () => assertAuthorizedTaskCreation('GENERAL_MANAGER'));
await check('authorized Manager creates and assigns task', async () => assertAuthorizedTaskCreation('MANAGER'));
await check('employee managed-task creation denied', async () => { const db = await signed('EMPLOYEE'); const { data: { user } } = await db.auth.getUser(); mustFail((await db.from('tasks').insert({ title: 'RLS employee probe', priority: 'low', status: 'todo', created_by: user?.id })).error, 'employee task insert'); });
await check('completion ownership boundary', async () => { const db = await signed('EMPLOYEE'); const { data: { user } } = await db.auth.getUser(); const foreign = await db.from('task_assignments').select('id').neq('profile_id', user?.id).limit(1).maybeSingle(); if (foreign.error) throw foreign.error; if (foreign.data) mustFail((await db.rpc('complete_task_with_update', { target_assignment: foreign.data.id, completion_body: 'boundary probe' })).error, 'foreign task completion'); });
await check('Daily Work owner boundary', async () => { const db = await signed('EMPLOYEE'); const { data: { user } } = await db.auth.getUser(); const result = await db.from('daily_work_updates').select('profile_id').neq('profile_id', user?.id).limit(1); if (result.error) throw result.error; if (result.data?.length) throw new Error('cross-profile daily work visible'); const date = new Date(Date.UTC(2200, 0, 1) + (Date.now() % 30_000) * 86_400_000).toISOString().slice(0, 10); const own = await db.from('daily_work_updates').insert({ profile_id: user?.id, work_date: date, summary: 'RELEASE_GATE disposable QA probe' }).select('id').single(); if (own.error) throw own.error; try { if (!own.data) throw new Error('own Daily Work insert was not returned'); } finally { if (own.data?.id) await db.from('daily_work_updates').delete().eq('id', own.data.id); } });
await check('Teams archive denied to employee', async () => { const db = await signed('EMPLOYEE'); mustFail((await db.rpc('archive_group_chat', { target_conversation: crypto.randomUUID() })).error, 'employee archive'); });
await check('operational report boundary', async () => { const db = await signed('EMPLOYEE'); const result = await db.from('employee_activity_logs').select('id').limit(1); if (!result.error && result.data?.length) throw new Error('management report activity visible'); });
await check('anonymous attendance regularization access denied', async () => mustFail((await client().from('attendance_regularization_requests').select('id').limit(1)).error, 'anonymous regularization read'));
await check('General Manager can review attendance regularizations through RLS', async () => { const db = await signed('GENERAL_MANAGER'); const result = await db.from('attendance_regularization_requests').select('id,profile_id,status').limit(1); if (result.error) throw result.error; });
await check('employee attendance regularization read remains owner-scoped', async () => { const db = await signed('EMPLOYEE'); const { data: { user } } = await db.auth.getUser(); const result = await db.from('attendance_regularization_requests').select('id,profile_id').limit(25); if (result.error) throw result.error; if (result.data?.some(row => row.profile_id !== user?.id)) throw new Error('employee can read another profile regularization'); });
await check('anonymous awareness-event access denied', async () => mustFail((await client().from('awareness_events').select('name').limit(1)).error, 'anonymous awareness-event read'));
await check('authenticated employee can read awareness events', async () => { const db = await signed('EMPLOYEE'); const result = await db.from('awareness_events').select('name,is_active').limit(1); if (result.error) throw result.error; });
await check('General Manager can create a company document through RLS', async () => {
  const db = await signed('GENERAL_MANAGER');
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('General Manager fixture missing');
  const inserted = await db.from('documents').insert({
    title: `RELEASE_GATE_POLICY_${Date.now()}`,
    description: 'Disposable QA policy authorization probe',
    category: 'Policy',
    storage_path: `release-gate/policies/${crypto.randomUUID()}.pdf`,
    file_name: 'release-gate-policy.pdf',
    mime_type: 'application/pdf',
    file_size: 1,
    uploaded_by: user.id,
  }).select('id,uploaded_by').single();
  if (inserted.error || !inserted.data) throw inserted.error || new Error('document not returned');
  try {
    if (inserted.data.uploaded_by !== user.id) throw new Error('document uploader mismatch');
  } finally {
    await db.from('documents').delete().eq('id', inserted.data.id);
  }
});
await check('meeting participant embeds resolve employee_id instead of invited_by', async () => {
  for (const role of ['GENERAL_MANAGER', 'EMPLOYEE']) {
    const db = await signed(role);
    const result = await db.from('meetings').select('id,meeting_participants(employee_id,profiles!meeting_participants_employee_id_fkey(id,full_name))').limit(10);
    if (result.error) throw result.error;
    for (const meeting of result.data || []) {
      for (const participant of meeting.meeting_participants || []) {
        if (participant.profiles && participant.profiles.id !== participant.employee_id) throw new Error('Wrong participant profile relationship');
      }
    }
  }
});
await check('payroll embeds resolve employee profile instead of finalizer', async () => {
  const db = await signed('GENERAL_MANAGER');
  const result = await db.from('payroll_entries').select('id,profile_id,profile:profiles!payroll_entries_profile_id_fkey(id)').limit(1);
  if (result.error) throw result.error;
  if (result.data?.some(row => row.profile && row.profile.id !== row.profile_id)) throw new Error('Wrong payroll profile relationship');
});
await check('canonical meeting lifecycle and employee/anonymous authorization', async () => {
  const gm = await signed('GENERAL_MANAGER');
  const employee = await signed('EMPLOYEE');
  const gmUser = (await gm.auth.getUser()).data.user;
  const employeeUser = (await employee.auth.getUser()).data.user;
  const hosts = await gm.rpc('meeting_hosts');
  if (hosts.error) throw hosts.error;
  const host = hosts.data.find(item => item.id === gmUser.id);
  if (!host) throw new Error('GM fixture is not an authorized host');
  const start = new Date(Date.now() + 80 * 86400_000);
  const payload = { target_meeting: null, host_profile_id: host.id, meeting_title: 'RELEASE_GATE_MEETING_SECURITY', meeting_agenda: 'Verify lifecycle authorization', meeting_start: start.toISOString(), meeting_end: new Date(+start + 600_000).toISOString(), meeting_type_value: 'office', meeting_venue: '', meeting_url_value: '', meeting_description: '', participant_ids: [employeeUser.id] };
  const denied = result => { if (result.error?.code !== '42501') throw new Error('Expected explicit permission denial, not a contract/schema error'); };
  denied(await client().rpc('save_meeting', payload));
  denied(await employee.rpc('save_meeting', payload));
  denied(await gm.rpc('save_meeting', { ...payload, host_profile_id: employeeUser.id }));
  const created = await gm.rpc('save_meeting', payload);
  if (created.error) throw created.error;
  try {
    const row = await employee.from('meetings').select('id,host_user_id,agenda,meeting_participants(employee_id)').eq('id', created.data).single();
    if (row.error) throw row.error;
    if (row.data.host_user_id !== host.id || row.data.agenda !== payload.meeting_agenda || !row.data.meeting_participants.some(item => item.employee_id === employeeUser.id)) throw new Error('Meeting host/agenda/participation did not persist');
    denied(await employee.rpc('save_meeting', { ...payload, target_meeting: created.data }));
    denied(await employee.rpc('cancel_meeting', { target_meeting: created.data, cancel_reason: 'Unauthorized cancellation probe' }));
    denied(await client().rpc('cancel_meeting', { target_meeting: created.data, cancel_reason: 'Anonymous cancellation probe' }));
    const edited = await gm.rpc('save_meeting', { ...payload, target_meeting: created.data, meeting_agenda: 'Updated security probe agenda' });
    if (edited.error) throw edited.error;
  } finally {
    const cancelled = await gm.rpc('cancel_meeting', { target_meeting: created.data, cancel_reason: 'Release gate security verification complete' });
    if (cancelled.error) throw cancelled.error;
  }
  const final = await gm.from('meetings').select('status,cancellation_reason,agenda').eq('id', created.data).single();
  if (final.error) throw final.error;
  if (final.data.status !== 'cancelled' || final.data.cancellation_reason !== 'Release gate security verification complete' || final.data.agenda !== 'Updated security probe agenda') throw new Error('Meeting edit/cancellation audit was not retained');
});
await check('patient document authenticated grants preserve upload RLS boundaries', async () => {
  const gm = await signed('GENERAL_MANAGER');
  const admin = await signed('ADMIN');
  const employee = await signed('EMPLOYEE');
  const gmUser = (await gm.auth.getUser()).data.user;
  const employeeUser = (await employee.auth.getUser()).data.user;
  if (!gmUser || !employeeUser) throw new Error('QA identities missing');
  const marker = `RELEASE_GATE_PATIENT_DOCUMENT_${Date.now()}`;
  const patient = await gm.from('patients').insert({patient_number:marker,full_name:marker,status:'active',source:'Other',is_demo:true,created_by:gmUser.id}).select('id').single();
  if (patient.error) throw patient.error;
  const payload = uploader => ({patient_id:patient.data.id,document_name:marker,original_filename:'qa.pdf',category:'Other',visibility:'general_staff',mime_type:'application/pdf',file_extension:'pdf',file_size_bytes:1,uploaded_by:uploader,storage_key:`pending-${crypto.randomUUID()}`});
  let document;
  try {
    const permission = await employee.rpc('has_permission',{permission_code:'patient_documents.upload'});
    if (permission.error || permission.data !== false) throw new Error('Employee fixture must lack upload permission');
    const unrelated = await employee.rpc('patient_access',{patient:patient.data.id});
    if (unrelated.error || unrelated.data !== false) throw new Error('Employee must not access the unrelated QA patient');
    for (const [db, actor] of [[employee,employeeUser.id],[client(),gmUser.id]]) {
      const denied = await db.from('patient_documents').insert(payload(actor));
      if (denied.error?.code !== '42501') throw new Error('Unauthorized document INSERT was not denied by access control');
    }
    const forged = await gm.from('patient_documents').insert(payload(employeeUser.id));
    if (forged.error?.code !== '42501') throw new Error('Forged uploader was not denied by RLS');
    const created = await gm.from('patient_documents').insert(payload(gmUser.id)).select('id,uploaded_by').single();
    if (created.error) throw created.error;
    document = created.data;
    if (document.uploaded_by !== gmUser.id) throw new Error('Uploader identity mismatch');
    const finalized = await gm.from('patient_documents').update({storage_key:`patients/${patient.data.id}/documents/${document.id}/v1/qa.pdf`,updated_by:gmUser.id}).eq('id',document.id).select('id').single();
    if (finalized.error) throw finalized.error;
    const adminRead = await admin.from('patient_documents').select('id').eq('id',document.id).single();
    if (adminRead.error) throw adminRead.error;
    const employeeRead = await employee.from('patient_documents').select('id').eq('id',document.id);
    if (employeeRead.error || employeeRead.data.length) throw new Error('Unrelated employee gained document visibility');
    const changed = await employee.from('patient_documents').update({document_name:'Unauthorized'}).eq('id',document.id).select('id');
    if (!changed.error && changed.data.length) throw new Error('Unrelated employee gained UPDATE access');
  } finally {
    if (document) {
      const archived = await gm.from('patient_documents').update({status:'archived',updated_by:gmUser.id}).eq('id',document.id);
      if (archived.error) throw archived.error;
    }
    const removed = await gm.from('patients').update({deleted_at:new Date().toISOString()}).eq('id',patient.data.id);
    if (removed.error) throw removed.error;
  }
});
await check('CRM archive preserves scoped RLS and denies unauthorized callers', verifyCrmArchive);
const failed = results.filter(result => result.status === 'FAIL');
const report = { qaProjectRef: actualRef, total: results.length, passed: results.length - failed.length, failed: failed.length, results };
mkdirSync('release-evidence', { recursive: true }); writeFileSync('release-evidence/security-results.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (failed.length) process.exitCode = 1;
