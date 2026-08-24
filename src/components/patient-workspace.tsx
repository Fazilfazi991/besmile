'use client';
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { genderLabel, genderOptions, normalizeGender } from '@/lib/gender';
import { isUuid } from '@/lib/patient-slug';
import { isLegacyPatientSource, normalizePatientSource, patientSourceLabel, patientSourceOptions } from '@/lib/patient-source';
import { PatientAppointmentsSection } from '@/components/doctor-scheduling';
import { documentExpiryLabel, documentExpiryState } from '@/lib/document-expiry-rules';
import { operationalEmployeeStatuses } from '@/lib/employee-status';
import { ConfirmationDialog } from '@/components/confirmation-dialog';

const db: any = supabase;
const types = ['Initial consultation', 'Individual session', 'Couple session', 'Family session', 'Child session', 'Online session', 'Follow-up', 'Assessment', 'Other'];
const statuses = ['active', 'inactive', 'discharged'];
const nullablePatientFields = ['phone', 'email', 'date_of_birth', 'gender', 'nationality', 'preferred_language', 'emergency_contact_name', 'emergency_contact_phone', 'source', 'status', 'address'];

export function PatientWorkspace({ patientSlug, basePath = '/admin/patients' }: { patientSlug: string; basePath?: string }) {
  const params = useSearchParams();
  const router = useRouter();
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setUnavailable(false);
    const patientQuery = db.from('patients').select('*,assigned:profiles!patients_assigned_psychologist_id_fkey(full_name)').is('deleted_at', null);
    const patientResult = isUuid(patientSlug) ? await patientQuery.eq('id', patientSlug).single() : await patientQuery.eq('slug', patientSlug).single();
    if (patientResult.error || !patientResult.data) { setP(null); setUnavailable(true); return; }
    const patient = patientResult.data;
    if (isUuid(patientSlug) && patient.slug) {
      window.location.replace(`${basePath}/${patient.slug}`);
      return;
    }
    const patientId = patient.id;
    const [b, c, d, e] = await Promise.all([
      db.from('patient_sessions').select('*').eq('patient_id', patientId).order('appointment_at', { ascending: false }),
      db.from('patient_notes').select('*,author:profiles!patient_notes_created_by_fkey(full_name)').eq('patient_id', patientId).order('created_at', { ascending: false }),
      db.from('patient_documents').select('*').eq('patient_id', patientId).is('deleted_at', null).order('uploaded_at', { ascending: false }),
      db.from('patient_activity_logs').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
    ]);
    setP(patient);
    setSessions(b.data || []);
    setNotes(c.data || []);
    setDocs(d.data || []);
    setActivity(e.data || []);
    const codes = ['patients.edit', 'patients.delete', 'patients.assign', 'patient_sessions.create', 'patient_notes.create', 'clinical_notes.create', 'patient_documents.upload'];
    const results = await Promise.all(codes.map(code => db.rpc('has_permission', { permission_code: code })));
    setPerms(Object.fromEntries(codes.map((code, i) => [code, !!results[i].data])));
    if (results[2].data) {
      const { data } = await db.from('profiles').select('id,full_name').eq('is_employee', true).eq('workforce_visible', true).neq('role', 'director').in('status', operationalEmployeeStatuses).order('full_name');
      setStaff(data || []);
    }
    if (params.get('edit') === '1' && results[0].data) setForm('patient');
  };

  useEffect(() => { void load(); }, [patientSlug]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => { if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [moreOpen]);

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
      setHasUnsavedChanges(false);
      setMessage(kind === 'patient' ? 'Client details updated successfully.' : 'Saved successfully.');
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

  const deleteClient = async () => {
    if (!p?.id || saving) return;
    setSaving('delete');
    setDeleteError('');
    try {
      const response = await fetch(`/api/patients/${p.id}/manage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'delete', payload: {} }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to delete this client.');
      setMoreOpen(false);
      setForm('');
      setMessage('Client deleted successfully');
      router.replace(`${basePath}?deleted=1`);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this client.');
    } finally {
      setSaving('');
    }
  };

  if (unavailable) return <p className="rounded bg-rose-50 p-4 text-rose-700">Client is unavailable or you do not have access.</p>;
  if (!p) return <p>Loading client...</p>;

  const closeForm = () => {
    if (!hasUnsavedChanges || window.confirm('Discard unsaved changes?')) {
      setForm('');
      setHasUnsavedChanges(false);
    }
  };
  const action = (permission: string, label: string, key: string) => perms[permission] && <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white" type="button" onClick={() => form === key ? closeForm() : setForm(key)}>{label}</button>;
  const legacySource = isLegacyPatientSource(p.source) ? String(p.source) : '';
  const editFields = [['full_name', 'Full name'], ['phone', 'Phone'], ['email', 'Email'], ['date_of_birth', 'Date of birth'], ['nationality', 'Nationality'], ['preferred_language', 'Preferred language'], ['emergency_contact_name', 'Emergency contact name'], ['emergency_contact_phone', 'Emergency phone']];

  return <section className="space-y-5">
    <div className="card flex flex-wrap justify-between gap-4 p-5"><div><h1 className="text-2xl font-bold">{p.full_name} {p.is_demo && <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">Demo</span>}</h1><p className="text-slate-600">{p.patient_number} - {p.status}</p></div><div className="flex gap-2">{action('patients.edit', 'Edit Client', 'patient')}{perms['patients.delete'] && <div className="relative z-30" ref={moreRef}><button className="rounded border px-3 py-2 text-sm" type="button" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(open => !open)}>More actions <span aria-hidden="true">▾</span></button>{moreOpen && <div role="menu" className="absolute right-0 top-full z-50 mt-2 min-w-40 rounded border bg-white p-1 shadow-lg"><button role="menuitem" type="button" className="w-full rounded px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50" onClick={() => { setMoreOpen(false); setDeleteError(''); setForm('delete'); }}>Delete Client</button></div>}</div>}</div></div>
    {message && <p role="status" aria-live="polite" className="rounded bg-slate-100 p-3 text-sm">{message}</p>}
    <div className="flex gap-2 overflow-x-auto border-b">{['Overview', 'Appointments', 'Sessions', 'Documents', 'Notes', 'Activity'].map(x => <button key={x} type="button" onClick={() => { setTab(x); setForm(''); }} className={`px-3 py-2 ${tab === x ? 'border-b-2 border-slate-900 font-bold' : ''}`}>{x}</button>)}</div>
    {tab === 'Overview' && <><div className="flex justify-end">{action('patients.edit', 'Edit Client', 'patient')}</div>{form === 'patient' && <form className="card grid gap-3 p-4 md:grid-cols-2" onChange={() => setHasUnsavedChanges(true)} onSubmit={event => save('patient', event)}>
      {editFields.map(([name, label]) => <label key={name}>{label}<input name={name} defaultValue={p[name] || ''} type={name === 'date_of_birth' ? 'date' : 'text'} className="mt-1 w-full rounded border p-2" /></label>)}
      <label>Gender<select name="gender" required defaultValue={normalizeGender(p.gender)} className="mt-1 w-full rounded border p-2"><option value="" disabled>Select gender</option>{genderOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label>Source<select name="source" required defaultValue={normalizePatientSource(p.source) || legacySource} className="mt-1 w-full rounded border p-2"><option value="" disabled>Select source</option>{legacySource && <option value={legacySource}>Legacy: {legacySource}</option>}{patientSourceOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label>Status<select name="status" defaultValue={p.status || 'active'} className="mt-1 w-full rounded border p-2">{statuses.map(status => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
      {perms['patients.assign'] && <label>Assigned clinician<select name="assigned_psychologist_id" defaultValue={p.assigned_psychologist_id || ''} className="mt-1 w-full rounded border p-2"><option value="">Unassigned</option>{staff.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select></label>}
      <label className="md:col-span-2">Address<textarea name="address" defaultValue={p.address || ''} className="mt-1 w-full rounded border p-2" /></label><div className="flex gap-3"><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" disabled={saving === 'patient'}>{saving === 'patient' ? 'Saving...' : 'Save Client'}</button><button className="rounded border px-3 py-2" type="button" onClick={closeForm} disabled={saving === 'patient'}>Cancel</button></div>
    </form>}<div className="card grid gap-3 p-5 md:grid-cols-2">{[['Phone', p.phone], ['Email', p.email], ['Gender', genderLabel(p.gender)], ['Source', patientSourceLabel(p.source)], ['Assigned clinician', p.assigned?.full_name], ['Address', p.address], ['Nationality', p.nationality], ['Language', p.preferred_language]].map(([label, value]) => <div key={label as string}><small className="text-slate-500">{label}</small><p>{value || '-'}</p></div>)}</div></>}
    {tab === 'Sessions' && <Tab title="Sessions" action={action('patient_sessions.create', 'Add Session', 'session')} form={form === 'session' && <form className="card grid gap-3 p-4 md:grid-cols-2" onSubmit={event => save('session', event)}><label>Date & time<input required name="appointment_at" type="datetime-local" className="mt-1 w-full rounded border p-2" /></label><label>Type<select name="session_type" className="mt-1 w-full rounded border p-2">{types.map(x => <option key={x}>{x}</option>)}</select></label><label>Duration (minutes)<input required min="0" name="duration_minutes" type="number" defaultValue="45" className="mt-1 w-full rounded border p-2" /></label><label>Status<select name="attendance_status" className="mt-1 w-full rounded border p-2">{['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled'].map(x => <option key={x}>{x}</option>)}</select></label><label>Session number<input name="session_number" type="number" min="1" className="mt-1 w-full rounded border p-2" /></label><label>Follow-up<input name="follow_up_at" type="date" className="mt-1 w-full rounded border p-2" /></label><label className="md:col-span-2">Administrative summary<textarea name="administrative_summary" className="mt-1 w-full rounded border p-2" /></label><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white" disabled={saving === 'session'}>{saving === 'session' ? 'Saving...' : 'Save session'}</button></form>} rows={sessions} empty="No sessions have been added yet." render={x => <><b>{new Date(x.appointment_at).toLocaleString()}</b> - {x.session_type}<p>{x.attendance_status} - {x.duration_minutes} minutes</p></>} />}
    {tab === 'Appointments' && <PatientAppointmentsSection patientId={p.id} scheduleBasePath={basePath.startsWith('/employee') ? '/employee/doctor-scheduling' : '/admin/doctor-scheduling'} />}
    {tab === 'Notes' && <Tab title="Notes" action={action('patient_notes.create', 'Add Note', 'note')} form={form === 'note' && <form className="card grid gap-3 p-4" onSubmit={event => save('note', event)}><label>Type<select name="note_type" className="mt-1 w-full rounded border p-2"><option value="administrative">Administrative</option>{perms['clinical_notes.create'] && <option value="clinical">Clinical</option>}</select></label><label>Visibility<input name="visibility" defaultValue="general_staff" className="mt-1 w-full rounded border p-2" /></label><label>Note<textarea required name="content" className="mt-1 w-full rounded border p-2" /></label><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white" disabled={saving === 'note'}>{saving === 'note' ? 'Saving...' : 'Save note'}</button></form>} rows={notes} empty="No notes have been added yet." render={x => <><b className="capitalize">{x.note_type}</b> - {x.author?.full_name || 'Staff'}<p>{x.content}</p></>} />}
    {tab === 'Documents' && <Tab title="Documents" action={action('patient_documents.upload', 'Upload Document', 'document')} form={form === 'document' && <form className="card grid gap-3 p-4 md:grid-cols-2" onSubmit={upload}><input required name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" /><input required name="documentName" placeholder="Document name" className="rounded border p-2" /><input required name="category" placeholder="Category" className="rounded border p-2" /><input required name="documentDate" type="date" className="rounded border p-2" /><select name="visibility" className="rounded border p-2"><option value="general_staff">General staff</option><option value="assigned_psychologist">Assigned psychologist</option><option value="clinical_team">Clinical team</option><option value="management_only">Management only</option></select><input name="expiryDate" type="date" className="rounded border p-2" /><textarea name="notes" placeholder="Notes" className="rounded border p-2 md:col-span-2" /><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white" disabled={saving === 'document'}>{saving === 'document' ? 'Uploading...' : 'Upload'}</button></form>} rows={docs} empty="No documents have been uploaded yet." render={x => { const expiry = documentExpiryLabel(x.expiry_date); const tone = documentExpiryState(x.expiry_date); return <><b>{x.document_name}</b><p>{x.category} - v{x.version}{expiry && <span className={`ml-2 ${tone === 'expired' ? 'text-rose-700' : tone === 'valid' ? 'text-emerald-700' : 'text-amber-700'}`}>{expiry}</span>}</p></>; }} />}
    {tab === 'Activity' && <Tab title="Activity" rows={activity} empty="No activity recorded." render={x => <><b>{x.action.replaceAll('_', ' ')}</b><p>{new Date(x.created_at).toLocaleString()}</p></>} />}
    <ConfirmationDialog open={form === 'delete'} title="Delete client?" description={`Are you sure you want to delete ${p.full_name}? This action may affect linked operational records.`} confirmLabel="Delete Client" destructive pending={saving === 'delete'} error={deleteError} onClose={() => { if (saving !== 'delete') { setForm(''); setDeleteError(''); } }} onConfirm={deleteClient} />
  </section>;
}

function Tab({ title, action, form, rows, empty, render }: { title: string; action?: any; form?: any; rows: any[]; empty: string; render: (x: any) => any }) {
  return <div className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2>{action}</div>{form}<div className="card divide-y">{rows.length ? rows.map(x => <div className="p-4" key={x.id}>{render(x)}</div>) : <p className="p-5 text-slate-600">{empty}</p>}</div></div>;
}
