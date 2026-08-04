'use client';
/* Data is loaded from Supabase after mount; state updates are intentionally async. */
/* eslint-disable react-hooks/set-state-in-effect */
/* Patient IDs are dynamic; profile navigation deliberately uses ordinary anchors. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { genderLabel, genderOptions, normalizeGender } from '@/lib/gender';
import { patientPath } from '@/lib/patient-slug';
import { normalizePatientSource, patientSourceLabel, patientSourceOptions } from '@/lib/patient-source';

const db: any = supabase;
const fmt = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '-';
const size = (n: number) => n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function PatientList() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let query = db.from('patients').select('*,assigned:profiles!patients_assigned_psychologist_id_fkey(full_name)', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
    if (search) query = query.or(`full_name.ilike.%${search}%,patient_number.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    if (status) query = query.eq('status', status);
    if (source) query = query.eq('source', source);
    const { data, error } = await query;
    if (error) setError('Unable to load patients.');
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Patients</h1><p className="text-slate-600">Patient records and administrative documents.</p></div><a className="rounded bg-slate-900 px-4 py-2 text-white" href="/admin/patients/new">Add patient</a></div>
    <div className="card flex flex-wrap gap-3 p-4"><input aria-label="Search patients" className="rounded border p-2" placeholder="Name, ID, phone or email" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && load()} /><select aria-label="Status" className="rounded border p-2" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="discharged">Discharged</option></select><select aria-label="Source" className="rounded border p-2" value={source} onChange={event => setSource(event.target.value)}><option value="">All sources</option>{patientSourceOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select><button className="rounded border px-3" onClick={load}>Search</button></div>
    {loading ? <div className="card p-5">Loading patients...</div> : error ? <div className="card p-5 text-rose-700">{error}</div> : !rows.length ? <div className="card p-8 text-center text-slate-600">No patients match these filters.</div> : <div className="card overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b text-left text-slate-500"><tr>{['Patient ID', 'Patient', 'Phone', 'Email', 'Source', 'Assigned clinician', 'Status', 'Registered', 'Actions'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(patient => <tr className="border-b" key={patient.id}><td className="p-3">{patient.patient_number}</td><td className="p-3 font-medium">{patient.full_name}</td><td className="p-3">{patient.phone || '-'}</td><td className="p-3">{patient.email || '-'}</td><td className="p-3">{patientSourceLabel(patient.source) || '-'}</td><td className="p-3">{patient.assigned?.full_name || 'Unassigned'}</td><td className="p-3 capitalize">{patient.status}</td><td className="p-3">{fmt(patient.created_at)}</td><td className="p-3"><a className="underline" href={patientPath('/admin/patients', patient)}>Open</a></td></tr>)}</tbody></table></div>}
  </section>;
}

export function PatientForm() {
  const [staff, setStaff] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { db.from('profiles').select('id,full_name').eq('status', 'active').then(({ data }: any) => setStaff(data || [])); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    payload.gender = normalizeGender(String(payload.gender || ''));
    payload.source = normalizePatientSource(String(payload.source || ''));
    if (!payload.gender) { setError('Select Male or Female.'); return; }
    if (!payload.source) { setError('Select a valid source.'); return; }
    setSaving(true);
    setError('');
    setNotice('');
    const { data: auth } = await db.auth.getUser();
    const clean = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value === '' ? null : value]));
    const { data, error } = await db.from('patients').insert({ ...clean, assigned_psychologist_id: payload.assigned_psychologist_id || null, created_by: auth.user?.id }).select('id,slug').single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    setNotice('Patient created successfully.');
    location.href = `/admin/patients/${data.slug || data.id}?created=1`;
  };

  return <section className="max-w-3xl space-y-5"><div><h1 className="text-2xl font-bold">Add patient</h1><p className="text-slate-600">Only enter information needed for care administration.</p></div>{notice && <p role="status" aria-live="polite" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{notice}</p>}{error && <p role="alert" className="text-rose-700">{error}</p>}<form onSubmit={submit} className="card grid gap-4 p-5 md:grid-cols-2">{[['patient_number', 'Patient ID'], ['full_name', 'Full name'], ['phone', 'Phone'], ['email', 'Email'], ['date_of_birth', 'Date of birth'], ['nationality', 'Nationality'], ['preferred_language', 'Preferred language'], ['emergency_contact_name', 'Emergency contact name'], ['emergency_contact_relationship', 'Relationship'], ['emergency_contact_phone', 'Emergency phone']].map(([name, label]) => <label key={name}>{label}<input required={name === 'patient_number' || name === 'full_name'} name={name} type={name === 'date_of_birth' ? 'date' : 'text'} className="mt-1 w-full rounded border p-2" /></label>)}<label>Gender<select name="gender" required defaultValue="" className="mt-1 w-full rounded border p-2"><option value="" disabled>Select gender</option>{genderOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Source<select name="source" required defaultValue="" className="mt-1 w-full rounded border p-2"><option value="" disabled>Select source</option>{patientSourceOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label>Status<select name="status" className="mt-1 w-full rounded border p-2"><option value="active">Active</option><option value="inactive">Inactive</option><option value="discharged">Discharged</option></select></label><label>Assigned clinician<select name="assigned_psychologist_id" className="mt-1 w-full rounded border p-2"><option value="">Unassigned</option>{staff.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select></label><label className="md:col-span-2">Address<textarea name="address" className="mt-1 w-full rounded border p-2" /></label><button className="w-fit rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60" disabled={saving}>{saving ? 'Creating...' : 'Create patient'}</button></form></section>;
}

export function PatientProfile({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<any>();
  const [documents, setDocuments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const [p, d, s, n, a] = await Promise.all([
      db.from('patients').select('*,assigned:profiles!patients_assigned_psychologist_id_fkey(full_name)').eq('id', patientId).single(),
      db.from('patient_documents').select('*').eq('patient_id', patientId).neq('status', 'replaced').order('uploaded_at', { ascending: false }),
      db.from('patient_sessions').select('*,assigned:profiles!patient_sessions_assigned_psychologist_id_fkey(full_name)').eq('patient_id', patientId).order('appointment_at', { ascending: false }),
      db.from('patient_notes').select('*,author:profiles!patient_notes_created_by_fkey(full_name)').eq('patient_id', patientId).order('created_at', { ascending: false }),
      db.from('patient_activity_logs').select('*,actor:profiles!patient_activity_logs_performed_by_fkey(full_name)').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(50),
    ]);
    if (p.error) setError('Patient is unavailable or you do not have access.');
    else setPatient(p.data);
    setDocuments(d.data || []);
    setSessions(s.data || []);
    setNotes(n.data || []);
    setActivity(a.data || []);
  };

  useEffect(() => { void load(); }, [patientId]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploading(true);
    setError('');
    const response = await fetch(`/api/patients/${patientId}/documents/upload`, { method: 'POST', body: new FormData(event.currentTarget) });
    setUploading(false);
    if (!response.ok) setError((await response.json()).error || 'Upload failed');
    else { event.currentTarget.reset(); await load(); }
  };

  if (error && !patient) return <p className="text-rose-700">{error}</p>;
  if (!patient) return <p>Loading patient...</p>;
  return <section className="space-y-5"><div className="card flex flex-wrap justify-between gap-4 p-5"><div><h1 className="text-2xl font-bold">{patient.full_name}</h1><p className="text-slate-600">{patient.patient_number} - <span className="capitalize">{patient.status}</span></p></div><div className="text-sm">Assigned clinician: <b>{patient.assigned?.full_name || 'Unassigned'}</b><br />Phone: {patient.phone || '-'}</div></div><div className="flex gap-2 overflow-x-auto border-b">{['Overview', 'Sessions', 'Documents', 'Notes', 'Activity'].map(x => <button type="button" onClick={() => setTab(x)} className={`whitespace-nowrap px-3 py-2 ${tab === x ? 'border-b-2 border-slate-900 font-bold' : ''}`} key={x}>{x}</button>)}</div>{error && <p className="text-rose-700">{error}</p>}{tab === 'Overview' && <div className="card grid gap-4 p-5 md:grid-cols-2"><Info label="Email" value={patient.email} /><Info label="Gender" value={genderLabel(patient.gender)} /><Info label="Source" value={patientSourceLabel(patient.source)} /><Info label="Date of birth" value={fmt(patient.date_of_birth)} /><Info label="Address" value={patient.address} /><Info label="Nationality" value={patient.nationality} /><Info label="Emergency contact" value={`${patient.emergency_contact_name || '-'} ${patient.emergency_contact_phone || ''}`} /></div>}{tab === 'Sessions' && <List empty="No sessions recorded." rows={sessions} render={s => <><b>{fmt(s.appointment_at)}</b> - {s.session_type} - <span className="capitalize">{s.attendance_status.replace('_', ' ')}</span><p className="text-slate-600">{s.assigned?.full_name || 'Unassigned'} - {s.duration_minutes || '-'} minutes</p></>} />} {tab === 'Documents' && <div className="space-y-4"><form onSubmit={upload} className="card grid gap-3 p-4 md:grid-cols-2"><input required name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" /><input required name="documentName" placeholder="Document name" className="rounded border p-2" /><select required name="category" className="rounded border p-2">{['Identification document', 'Consent form', 'Assessment report', 'Prescription', 'Medical report', 'Referral letter', 'Session document', 'Insurance document', 'Payment receipt', 'Other'].map(x => <option key={x}>{x}</option>)}</select><input required name="documentDate" type="date" className="rounded border p-2" defaultValue={new Date().toISOString().slice(0, 10)} /><select name="visibility" className="rounded border p-2"><option value="general_staff">General staff</option><option value="assigned_psychologist">Assigned psychologist</option><option value="clinical_team">Clinical team</option><option value="management_only">Management only</option></select><input name="expiryDate" type="date" className="rounded border p-2" /><textarea name="notes" placeholder="Notes (optional)" className="rounded border p-2 md:col-span-2" /><button disabled={uploading} className="w-fit rounded bg-slate-900 px-4 py-2 text-white">{uploading ? 'Uploading...' : 'Upload document'}</button><small>PDF, JPG, JPEG or PNG, up to 20 MB. Malware scanning is not yet enabled.</small></form><List empty="No documents uploaded." rows={documents} render={d => <div className="flex justify-between gap-3"><span><b>{d.document_name}</b> - {d.category}<p className="text-slate-600">{d.original_filename} - {size(d.file_size_bytes)} - v{d.version} - {fmt(d.uploaded_at)}</p></span><button className="underline" onClick={async () => { const response = await fetch(`/api/patients/${patientId}/documents/${d.id}/signed-url`, { method: 'POST' }); const data = await response.json(); if (data.url) window.open(data.url, '_blank', 'noopener'); else setError(data.error || 'Unable to open document.'); }}>Open</button></div>} /></div>}{tab === 'Notes' && <List empty="No notes available." rows={notes} render={n => <><b className="capitalize">{n.note_type}</b> - {n.author?.full_name || 'Unknown'} - {fmt(n.created_at)}<p className="whitespace-pre-wrap text-slate-700">{n.content}</p></>} />} {tab === 'Activity' && <List empty="No activity available." rows={activity} render={a => <><b>{a.action.replaceAll('_', ' ')}</b> - {a.actor?.full_name || 'System'}<p className="text-slate-600">{fmt(a.created_at)}</p></>} />}</section>;
}

function Info({ label, value }: { label: string; value?: string | null }) { return <div><p className="text-xs uppercase text-slate-500">{label}</p><p>{value || '-'}</p></div>; }
function List({ rows, empty, render }: { rows: any[]; empty: string; render: (x: any) => any }) { return <div className="card divide-y">{rows.length ? rows.map(x => <div className="p-4" key={x.id}>{render(x)}</div>) : <p className="p-5 text-slate-600">{empty}</p>}</div>; }
