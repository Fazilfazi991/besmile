import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]; }));
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (projectRef !== 'ksmqzxncdvuxiabypjth') throw new Error(`Refusing to seed unexpected project ${projectRef}.`);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const profile = async (email) => { const result = await admin.from('profiles').select('id').eq('email', email).single(); if (result.error) throw result.error; return result.data; };
const ayisha = await profile('ayishamuneer.dxb@gmail.com');
const rishad = await profile('fazil4fazi@gmail.com');
const faiz = await profile('bsmile.gm@gmail.com');

const ensurePatient = async (number, name, email) => {
  const existing = await admin.from('patients').select('id,patient_number').eq('patient_number', number).eq('is_demo', true).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const created = await admin.from('patients').insert({ patient_number: number, full_name: name, email, status: 'active', source: 'Other', tags: ['Demo Patient', 'Restricted Access Test'], is_demo: true, created_by: faiz.id }).select('id,patient_number').single();
  if (created.error) throw created.error;
  return created.data;
};
const assignedPatient = await ensurePatient('DEMO-PAT-INT-001', 'Demo Assigned Patient', 'assigned.intern.demo@bsmile.test');
const unassignedPatient = await ensurePatient('DEMO-PAT-INT-002', 'Demo Unassigned Patient', 'unassigned.intern.demo@bsmile.test');
const assignment = await admin.from('patient_access_assignments').upsert({ patient_id: assignedPatient.id, profile_id: ayisha.id, assigned_by: faiz.id, assignment_type: 'intern', starts_at: new Date().toISOString(), ends_at: null }, { onConflict: 'patient_id,profile_id,assignment_type' });
if (assignment.error) throw assignment.error;
await admin.from('patient_access_assignments').delete().eq('patient_id', unassignedPatient.id).eq('profile_id', ayisha.id);

const ensurePatientDocument = async (patient) => {
  const path = `restricted-access-demo/${patient.id}/intern-demo.txt`;
  const body = new TextEncoder().encode('BSmile restricted access demo document.');
  const upload = await admin.storage.from('patient-documents').upload(path, body, { contentType: 'text/plain', upsert: true });
  if (upload.error) throw upload.error;
  const saved = await admin.from('patient_documents').upsert({ patient_id: patient.id, document_name: 'Intern access demo document', original_filename: 'intern-demo.txt', category: 'Other', storage_bucket: 'patient-documents', storage_key: path, mime_type: 'text/plain', file_extension: 'txt', file_size_bytes: body.byteLength, visibility: 'general_staff', uploaded_by: faiz.id }, { onConflict: 'storage_key' }).select('id').single();
  if (saved.error) throw saved.error;
  return saved.data;
};
const assignedDocument = await ensurePatientDocument(assignedPatient);
const unassignedDocument = await ensurePatientDocument(unassignedPatient);

const existingLead = await admin.from('crm_leads').select('id').eq('phone', '+971500000099').maybeSingle();
if (existingLead.error) throw existingLead.error;
let lead = existingLead.data;
if (!lead) {
  const created = await admin.from('crm_leads').insert({ full_name: 'Demo Guest Sales Lead', phone: '+971500000099', reason_for_enquiry: 'Restricted sales access test', location: 'Dubai', temperature: 'warm', remarks: 'Demo record only', assigned_to: rishad.id, created_by: faiz.id }).select('id').single();
  if (created.error) throw created.error;
  lead = created.data;
} else {
  const reassigned = await admin.from('crm_leads').update({ assigned_to: rishad.id, archived_at: null }).eq('id', lead.id);
  if (reassigned.error) throw reassigned.error;
}
const saleResult = await admin.from('crm_sales').upsert({ lead_id: lead.id, sale_value: 100, currency: 'INR', service_details: 'Demo restricted-access sale', notes: 'Demo record only', created_by: rishad.id, status: 'open' }, { onConflict: 'lead_id' }).select('id').single();
if (saleResult.error) throw saleResult.error;
const sale = saleResult.data;
const salesPath = `restricted-access-demo/${rishad.id}/${sale.id}/sales-demo.txt`;
const salesBody = new TextEncoder().encode('BSmile guest sales demo document.');
const salesUpload = await admin.storage.from('sales-documents').upload(salesPath, salesBody, { contentType: 'text/plain', upsert: true });
if (salesUpload.error) throw salesUpload.error;
const salesDocument = await admin.from('crm_sales_documents').upsert({ sale_id: sale.id, file_name: 'sales-demo.txt', storage_path: salesPath, mime_type: 'text/plain', uploaded_by: rishad.id, archived_at: null }, { onConflict: 'storage_path' }).select('id').single();
if (salesDocument.error) throw salesDocument.error;

console.log(JSON.stringify({ ayisha: { assignedPatientId: assignedPatient.id, unassignedPatientId: unassignedPatient.id, assignedDocumentId: assignedDocument.id, unassignedDocumentId: unassignedDocument.id }, rishad: { leadId: lead.id, saleId: sale.id, salesDocumentId: salesDocument.data.id } }));
