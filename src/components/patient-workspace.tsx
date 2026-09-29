'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { genderLabel, genderOptions, normalizeGender } from '@/lib/gender';
import { isUuid } from '@/lib/patient-slug';
import { isLegacyPatientSource, normalizePatientSource, patientSourceLabel, patientSourceOptions } from '@/lib/patient-source';
import { PatientAppointmentsSection } from '@/components/doctor-scheduling';
import { documentExpiryLabel, documentExpiryState } from '@/lib/document-expiry-rules';
import { PatientDocumentActions } from '@/components/patient-document-actions';
import { operationalEmployeeStatuses } from '@/lib/employee-status';
import { sessionFinanceSummary } from '@/lib/session-finance';

const db: any = supabase;
const types = ['Initial consultation', 'Individual session', 'Couple session', 'Family session', 'Child session', 'Online session', 'Follow-up', 'Assessment', 'Other'];
const statuses = ['active', 'inactive', 'discharged'];
const nullablePatientFields = ['phone', 'email', 'date_of_birth', 'gender', 'nationality', 'preferred_language', 'emergency_contact_name', 'emergency_contact_phone', 'source', 'status', 'address'];

export function PatientWorkspace({ patientSlug, basePath = '/admin/patients' }: { patientSlug: string; basePath?: string }) {
  const params = useSearchParams();
  const [p, setP] = useState<any>();
  const [sessions, setSessions] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [tab, setTab] = useState('Overview');
  const [form, setForm] = useState('');
  const [message, setMessage] = useState(params.get('created') === '1' ? 'Client created successfully.' : '');
  const [saving, setSaving] = useState('');
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [canViewCareWorkspace, setCanViewCareWorkspace] = useState(false);
  const [financeAccounts, setFinanceAccounts] = useState<any[]>([]);
  const [sessionRequestKey, setSessionRequestKey] = useState('');
  const [recordPaymentNow, setRecordPaymentNow] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [paymentRequestKey, setPaymentRequestKey] = useState('');
  const [archivePreview, setArchivePreview] = useState<any>();
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveAcknowledged, setArchiveAcknowledged] = useState(false);

  const load = async () => {
    setUnavailable(false);
    const codes = ['patients.edit', 'patients.assign', 'patient_sessions.create', 'patient_notes.create', 'clinical_notes.create', 'patient_documents.upload', 'patient_documents.download', 'patients.archive', 'invoices.manage', 'finance.manage'];
    const permissionResults = await Promise.all(codes.map(code => db.rpc('has_permission', { permission_code: code })));
    const nextPerms = Object.fromEntries(codes.map((code, i) => [code, !!permissionResults[i].data]));
    setPerms(nextPerms);

    const identityFields = 'id,patient_number,full_name,date_of_birth,gender,phone,email,address,nationality,preferred_language,emergency_contact_name,emergency_contact_relationship,emergency_contact_phone,source,status,slug,is_demo,created_at,archived_at,archive_reason';
    const patientQuery = db.from('patients').select(identityFields).is('deleted_at', null);
    const patientResult = isUuid(patientSlug) ? await patientQuery.eq('id', patientSlug).single() : await patientQuery.eq('slug', patientSlug).single();
    if (patientResult.error || !patientResult.data) { setP(null); setUnavailable(true); return; }
    let patient = patientResult.data;
    if (isUuid(patientSlug) && patient.slug) {
      window.location.replace(`${basePath}/${patient.slug}`);
      return;
    }
    const patientId = patient.id;
    const careResult = await db.rpc('patient_care_access', { patient: patientId });
    const hasCareAccess = !!careResult.data;
    setCanViewCareWorkspace(hasCareAccess);

    if (hasCareAccess) {
      const [fullPatient, b, c, d, e] = await Promise.all([
        db.from('patients').select('*,assigned:profiles!patients_assigned_psychologist_id_fkey(full_name)').eq('id', patientId).single(),
        db.from('patient_sessions').select('*,practitioner:profiles!patient_sessions_assigned_psychologist_id_fkey(full_name),invoice:finance_invoices!patient_sessions_invoice_id_fkey(id,invoice_number,status,finance_invoice_items(quantity,rate),finance_invoice_payments(id,finance_transaction_id,amount,reference_number,payment_date))').eq('patient_id', patientId).order('appointment_at', { ascending: false }),
        db.from('patient_notes').select('*,author:profiles!patient_notes_created_by_fkey(full_name)').eq('patient_id', patientId).order('created_at', { ascending: false }),
        db.from('patient_documents').select('*').eq('patient_id', patientId).is('deleted_at', null).order('uploaded_at', { ascending: false }),
        db.from('patient_activity_logs').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      ]);
      if (fullPatient.data) patient = fullPatient.data;
      setSessions(b.data || []);
      setNotes(c.data || []);
      setDocs(d.data || []);
      setActivity(e.data || []);
    } else {
      setSessions([]);
      setNotes([]);
      setDocs([]);
      setActivity([]);
      setTab('Overview');
    }
    setP(patient);
    if ((permissionResults[1].data || permissionResults[2].data) && hasCareAccess) {
      const { data } = await db.from('profiles').select('id,full_name,role,designation').eq('is_employee', true).eq('workforce_visible', true).neq('role', 'director').in('status', operationalEmployeeStatuses).order('full_name');
      setStaff((data || []).filter((person: any) => person.role === 'psychologist' || /psycholog/i.test(person.designation || '')));
    }
    if ((permissionResults[8].data || permissionResults[9].data) && hasCareAccess) {
      const { data } = await db.from('finance_accounts').select('id,name').eq('is_active', true).order('name');
      setFinanceAccounts(data || []);
    } else setFinanceAccounts([]);
    if (params.get('edit') === '1' && permissionResults[0].data && hasCareAccess) setForm('patient');
  };

  useEffect(() => { void load(); }, [patientSlug]);

  const save = async (kind: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!p?.id || saving) return;
    const payload: Record<string, FormDataEntryValue | null> = Object.fromEntries(new FormData(event.currentTarget));
    if (kind === 'patient') {
      payload.gender = normalizeGender(String(payload.gender || ''));
      payload.source = normalizePatientSource(String(payload.source || ''));
      payload.status = statuses.includes(String(payload.status)) ? payload.status : 'active';
      for (const key of nullablePatientFields) if (payload[key] === '') payload[key] = null;
      if (!String(payload.full_name || '').trim()) { setMessage('Full name is required.'); return; }
      if (!payload.gender) { setMessage('Select Male or Female.'); return; }
      if (!payload.source) { setMessage('Select a valid source.'); return; }
    }
    setSaving(kind);
    setMessage(kind === 'patient' ? 'Saving client details...' : 'Saving...');
    try {
      const response = await fetch(`/api/patients/${p.id}/manage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, payload }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save.');
      setForm('');
      if (kind === 'session') setRecordPaymentNow(false);
      if (kind === 'payment') { setPaymentInvoiceId(''); setPaymentRequestKey(''); }
      setHasUnsavedChanges(false);
      setMessage(kind === 'patient' ? 'Client details updated successfully.' : kind === 'payment' ? 'Payment recorded successfully.' : 'Saved successfully.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save changes.');
    } finally {
      setSaving('');
    }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!p?.id || saving) return;
    setSaving('document');
    setMessage('Uploading...');
    try {
      const response = await fetch(`/api/patients/${p.id}/documents/upload`, { method: 'POST', body: new FormData(event.currentTarget) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      setForm('');
      setMessage('Document uploaded.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setSaving('');
    }
  };

  if (unavailable) return <p className="rounded bg-rose-50 p-4 text-rose-700">Client is unavailable or you do not have access.</p>;
  if (!p) return <p>Loading client...</p>;

  const closeForm = () => {
    if (!hasUnsavedChanges || window.confirm('Discard unsaved changes?')) {
      setForm('');
      setRecordPaymentNow(false);
      setPaymentInvoiceId('');
      setPaymentRequestKey('');
      setHasUnsavedChanges(false);
    }
  };
  const action = (permission: string, label: string, key: string) => !p.archived_at && perms[permission] && <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white" type="button" onClick={() => form === key ? closeForm() : setForm(key)}>{label}</button>;
  const canRecordPayment = !!(perms['invoices.manage'] || perms['finance.manage']);
  const sessionAction = !p.archived_at && perms['patient_sessions.create'] && <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white" type="button" onClick={() => { if (form === 'session') closeForm(); else { setSessionRequestKey(globalThis.crypto.randomUUID()); setRecordPaymentNow(false); setPaymentInvoiceId(''); setForm('session'); } }}>Add Session</button>;
  const archiveAction = async (kind: 'archive_preview'|'archive'|'restore') => {
    setSaving(kind); setMessage(kind === 'archive_preview' ? 'Checking linked records…' : 'Saving client lifecycle change…');
    try {
      const response = await fetch(`/api/patients/${p.id}/manage`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ kind, payload:{ reason:archiveReason, acknowledge_outstanding:archiveAcknowledged } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update client.');
      if (kind === 'archive_preview') { setArchivePreview(data.preview); setMessage('Review the effects below before confirming.'); }
      else { setArchivePreview(undefined); setArchiveReason(''); setForm(''); setMessage(kind === 'archive' ? 'Client archived. Linked history and financial records were preserved.' : 'Client restored with the same ID.'); await load(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update client.'); }
    finally { setSaving(''); }
  };
  const legacySource = isLegacyPatientSource(p.source) ? String(p.source) : '';
  const editFields = [['full_name', 'Full name'], ['phone', 'Phone'], ['email', 'Email'], ['date_of_birth', 'Date of birth'], ['nationality', 'Nationality'], ['preferred_language', 'Preferred language'], ['emergency_contact_name', 'Emergency contact name'], ['emergency_contact_phone', 'Emergency phone']];
  const overviewFields = [
    ['Phone', p.phone],
    ['Email', p.email],
    ['Gender', genderLabel(p.gender)],
    ['Source', patientSourceLabel(p.source)],
    ...(canViewCareWorkspace ? [['Assigned clinician', p.assigned?.full_name]] : []),
    ['Address', p.address],
    ['Nationality', p.nationality],
    ['Language', p.preferred_language],
  ];

  return <section className="patient-workspace min-w-0 max-w-full space-y-5">
    <div className="card flex flex-wrap justify-between gap-4 p-5"><div className="min-w-0 flex-1 basis-60"><h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{p.full_name} {p.is_demo && <span className="inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Demo</span>} {p.archived_at && <span className="inline-block rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">Archived</span>}</h1><p className="text-slate-600 [overflow-wrap:anywhere]">{p.patient_number} - {p.status}</p></div>{canViewCareWorkspace && <div className="flex max-w-full flex-wrap items-start gap-2">{!p.archived_at && action('patients.edit', 'Edit Client', 'patient')}{perms['patients.archive'] && <button className="rounded border px-3 py-2 text-sm" type="button" onClick={() => { setArchivePreview(undefined); setForm('more'); }}>More actions</button>}</div>}</div>
    {message && <p role="status" aria-live="polite" className="rounded bg-slate-100 p-3 text-sm">{message}</p>}
    {form === 'more' && perms['patients.archive'] && <section className="card grid gap-4 p-5" aria-label="Client lifecycle actions">
      <div><h2 className="font-bold">{p.archived_at ? 'Restore client' : 'Archive client'}</h2><p className="mt-1 text-sm text-slate-600">{p.archived_at ? 'Restoration keeps this client ID and makes the client available for new appointments again.' : 'Archival is reversible. Sessions, appointments, invoices, payments, receipts, conversion dates, and audit history remain unchanged.'}</p></div>
      <label className="text-sm font-medium">Reason<textarea className="input mt-1" required value={archiveReason} onChange={event => setArchiveReason(event.target.value)} /></label>
      {!p.archived_at && !archivePreview && <button className="btn border w-fit" type="button" disabled={!archiveReason.trim() || !!saving} onClick={() => void archiveAction('archive_preview')}>Review archive effects</button>}
      {archivePreview && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>Future appointments: <b>{archivePreview.future_appointments}</b></p><p>Outstanding balance: <b>INR {Number(archivePreview.outstanding_balance || 0).toFixed(2)}</b></p><p>Sessions retained: <b>{archivePreview.session_count}</b></p><p>Payments retained: <b>{archivePreview.payment_count}</b></p>{Number(archivePreview.outstanding_balance)>0 && <label className="mt-3 flex gap-2"><input type="checkbox" checked={archiveAcknowledged} onChange={event => setArchiveAcknowledged(event.target.checked)} /> I acknowledge that outstanding payments remain collectible.</label>}</div>}
      <div className="flex gap-2"><button className="btn border" type="button" onClick={() => setForm('')}>Cancel</button>{p.archived_at ? <button className="btn btn-primary" type="button" disabled={!archiveReason.trim() || !!saving} onClick={() => void archiveAction('restore')}>Restore client</button> : archivePreview && <button className="btn btn-primary" type="button" disabled={Number(archivePreview.future_appointments)>0 || (Number(archivePreview.outstanding_balance)>0 && !archiveAcknowledged) || !!saving} onClick={() => void archiveAction('archive')}>Confirm archive</button>}</div>
    </section>}
    <div className="flex gap-2 overflow-x-auto border-b">{(canViewCareWorkspace ? ['Overview', 'Appointments', 'Sessions', 'Documents', 'Notes', 'Activity'] : ['Overview']).map(x => <button key={x} type="button" onClick={() => { setTab(x); setForm(''); }} className={`px-3 py-2 ${tab === x ? 'border-b-2 border-slate-900 font-bold' : ''}`}>{x}</button>)}</div>
    {tab === 'Overview' && <><div className="flex justify-end">{canViewCareWorkspace && action('patients.edit', 'Edit patient', 'patient')}</div>{canViewCareWorkspace && form === 'patient' && <form className="card grid gap-3 p-4 md:grid-cols-2" onChange={() => setHasUnsavedChanges(true)} onSubmit={event => save('patient', event)}>
      {editFields.map(([name, label]) => <label key={name}>{label}<input name={name} defaultValue={p[name] || ''} type={name === 'date_of_birth' ? 'date' : 'text'} className="mt-1 w-full rounded border p-2" /></label>)}
      <label>Gender<select name="gender" required defaultValue={normalizeGender(p.gender)} className="mt-1 w-full rounded border p-2"><option value="" disabled>Select gender</option>{genderOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label>Source<select name="source" required defaultValue={normalizePatientSource(p.source) || legacySource} className="mt-1 w-full rounded border p-2"><option value="" disabled>Select source</option>{legacySource && <option value={legacySource}>Legacy: {legacySource}</option>}{patientSourceOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={p.status || 'active'} className="mt-1 w-full rounded border p-2">{statuses.map(status => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
      {perms['patients.assign'] && <label>Assigned clinician<select name="assigned_psychologist_id" defaultValue={p.assigned_psychologist_id || ''} className="mt-1 w-full rounded border p-2"><option value="">Unassigned</option>{staff.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select></label>}
      <label className="md:col-span-2">Address<textarea name="address" defaultValue={p.address || ''} className="mt-1 w-full rounded border p-2" /></label><div className="flex gap-3"><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" disabled={saving === 'patient'}>{saving === 'patient' ? 'Saving...' : 'Save patient'}</button><button className="rounded border px-3 py-2" type="button" onClick={closeForm} disabled={saving === 'patient'}>Cancel</button></div>
    </form>}<div className="card grid gap-3 p-5 md:grid-cols-2">{overviewFields.map(([label, value]) => <div key={label as string}><small className="text-slate-500">{label}</small><p>{value || '-'}</p></div>)}</div></>}
    {tab === 'Sessions' && <Tab title="Sessions" action={!p.archived_at && sessionAction} form={form === 'session' && <form className="card grid gap-3 p-4 md:grid-cols-2" onSubmit={event => save('session', event)}>
      <input type="hidden" name="idempotency_key" value={sessionRequestKey} />
      <label>Date & time<input required name="appointment_at" type="datetime-local" className="mt-1 w-full rounded border p-2" /></label>
      <label>Practitioner<select name="assigned_psychologist_id" className="mt-1 w-full rounded border p-2"><option value="">Unassigned</option>{staff.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select></label>
      <label>Type<select name="session_type" className="mt-1 w-full rounded border p-2">{types.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Duration (minutes)<input required min="1" name="duration_minutes" type="number" defaultValue="45" className="mt-1 w-full rounded border p-2" /></label>
      <label>Status<select name="attendance_status" className="mt-1 w-full rounded border p-2">{['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Session number<input name="session_number" type="number" min="1" className="mt-1 w-full rounded border p-2" /></label>
      <label>Follow-up<input name="follow_up_at" type="date" className="mt-1 w-full rounded border p-2" /></label>
      <label>Session Fee (INR)<input name="session_fee" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 w-full rounded border p-2" /></label>
      {canRecordPayment && <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={recordPaymentNow} onChange={event => setRecordPaymentNow(event.target.checked)} /> Record payment now</label>}
      {canRecordPayment && recordPaymentNow && <><label>Amount received<input required name="received_amount" type="number" min="0.01" step="0.01" className="mt-1 w-full rounded border p-2" /></label><label>Receiving account<select required name="receiving_account" className="mt-1 w-full rounded border p-2"><option value="">Choose account</option>{financeAccounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label>Payment method<select required name="payment_method" className="mt-1 w-full rounded border p-2"><option value="">Choose method</option>{['cash','bank_transfer','upi','card'].map(method => <option value={method} key={method}>{method.replace('_',' ')}</option>)}</select></label><label>Reference<input name="reference_number" className="mt-1 w-full rounded border p-2" /></label></>}
      <label className="md:col-span-2">Administrative summary<textarea name="administrative_summary" className="mt-1 w-full rounded border p-2" /></label>
      <button className="w-fit rounded bg-slate-900 px-3 py-2 text-white" disabled={saving === 'session'}>{saving === 'session' ? 'Saving...' : 'Save session'}</button>
    </form>} rows={sessions} empty="No sessions have been added yet." render={x => { const finance=sessionFinanceSummary(x.session_fee,x.invoice?.finance_invoice_payments||[]); const paymentOpen=form==='payment'&&paymentInvoiceId===x.invoice?.id; return <><b>{new Date(x.appointment_at).toLocaleString()}</b> - {x.session_type}<p>{x.attendance_status} - {x.duration_minutes} minutes{x.practitioner?.full_name ? ` - ${x.practitioner.full_name}` : ''}</p><p>Fee: INR {finance.fee.toFixed(2)} - Received: INR {finance.received.toFixed(2)} - Outstanding: INR {finance.outstanding.toFixed(2)}</p>{x.invoice && <small>{x.invoice.invoice_number} - {finance.fee > 0 && finance.outstanding === 0 ? 'Paid / Fully paid' : x.invoice.status}</small>}{canRecordPayment && x.invoice && finance.outstanding > 0 && !paymentOpen && <div className="mt-3"><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => { setPaymentInvoiceId(x.invoice.id); setPaymentRequestKey(globalThis.crypto.randomUUID()); setForm('payment'); }}>Add Payment</button></div>}{paymentOpen && <form className="mt-4 grid gap-3 rounded border p-3 md:grid-cols-2" onSubmit={event => save('payment', event)}><input type="hidden" name="invoice_id" value={x.invoice.id} /><input type="hidden" name="idempotency_key" value={paymentRequestKey} /><label>Amount received<input required name="amount" type="number" min="0.01" max={finance.outstanding} step="0.01" className="mt-1 w-full rounded border p-2" /></label><label>Payment date<input required name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded border p-2" /></label><label>Receiving account<select required name="account_id" className="mt-1 w-full rounded border p-2"><option value="">Choose account</option>{financeAccounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label>Payment method<select required name="payment_method" className="mt-1 w-full rounded border p-2"><option value="">Choose method</option>{['cash','bank_transfer','upi','card'].map(method => <option value={method} key={method}>{method.replace('_',' ')}</option>)}</select></label><label className="md:col-span-2">Reference<input name="reference_number" className="mt-1 w-full rounded border p-2" /></label><div className="flex gap-2 md:col-span-2"><button type="button" className="rounded border px-3 py-2" onClick={() => { setForm(''); setPaymentInvoiceId(''); setPaymentRequestKey(''); }}>Cancel</button><button className="rounded bg-slate-900 px-3 py-2 text-white" disabled={saving === 'payment'}>{saving === 'payment' ? 'Recording...' : 'Record Payment'}</button></div></form>}</>; }} />}
    {tab === 'Appointments' && <PatientAppointmentsSection patientId={p.id} readOnly={!!p.archived_at} scheduleBasePath={basePath.startsWith('/employee') ? '/employee/doctor-scheduling' : '/admin/doctor-scheduling'} />}
    {tab === 'Notes' && <Tab title="Notes" action={action('patient_notes.create', 'Add Note', 'note')} form={form === 'note' && <form className="card grid gap-3 p-4" onSubmit={event => save('note', event)}><label>Type<select name="note_type" className="mt-1 w-full rounded border p-2"><option value="administrative">Administrative</option>{perms['clinical_notes.create'] && <option value="clinical">Clinical</option>}</select></label><label>Visibility<input name="visibility" defaultValue="general_staff" className="mt-1 w-full rounded border p-2" /></label><label>Note<textarea required name="content" className="mt-1 w-full rounded border p-2" /></label><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white" disabled={saving === 'note'}>{saving === 'note' ? 'Saving...' : 'Save note'}</button></form>} rows={notes} empty="No notes have been added yet." render={x => <><b className="capitalize">{x.note_type}</b> - {x.author?.full_name || 'Staff'}<p>{x.content}</p></>} />}
    {tab === 'Documents' && <Tab title="Documents" action={action('patient_documents.upload', 'Upload Document', 'document')} form={form === 'document' && <form className="card grid gap-3 p-4 md:grid-cols-2" onSubmit={upload}><input required name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" /><input required name="documentName" placeholder="Document name" className="rounded border p-2" /><input required name="category" placeholder="Category" className="rounded border p-2" /><input required name="documentDate" type="date" className="rounded border p-2" /><select name="visibility" className="rounded border p-2"><option value="general_staff">General staff</option><option value="assigned_psychologist">Assigned psychologist</option><option value="clinical_team">Clinical team</option><option value="management_only">Management only</option></select><input name="expiryDate" type="date" className="rounded border p-2" /><textarea name="notes" placeholder="Notes" className="rounded border p-2 md:col-span-2" /><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white" disabled={saving === 'document'}>{saving === 'document' ? 'Uploading...' : 'Upload'}</button></form>} rows={docs} empty="No documents have been uploaded yet." render={x => { const expiry = documentExpiryLabel(x.expiry_date); const tone = documentExpiryState(x.expiry_date); return <><b>{x.document_name}</b>{perms['patient_documents.download'] && <PatientDocumentActions patientId={p.id} documentId={x.id} filename={x.original_filename} />}<p>{x.category} - v{x.version}{expiry && <span className={`ml-2 ${tone === 'expired' ? 'text-rose-700' : tone === 'valid' ? 'text-emerald-700' : 'text-amber-700'}`}>{expiry}</span>}</p></>; }} />}
    {tab === 'Activity' && <Tab title="Activity" rows={activity} empty="No activity recorded." render={x => <><b>{x.action.replaceAll('_', ' ')}</b><p>{new Date(x.created_at).toLocaleString()}</p></>} />}
  </section>;
}

function Tab({ title, action, form, rows, empty, render }: { title: string; action?: any; form?: any; rows: any[]; empty: string; render: (x: any) => any }) {
  return <div className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2>{action}</div>{form}<div className="card divide-y">{rows.length ? rows.map(x => <div className="p-4" key={x.id}>{render(x)}</div>) : <p className="p-5 text-slate-600">{empty}</p>}</div></div>;
}
