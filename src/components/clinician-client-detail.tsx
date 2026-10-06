'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { clinicianRepository, clinicianRpc } from '@/lib/clinician-repository';
import { supabase } from '@/lib/supabase';
import { PatientDocumentActions } from './patient-document-actions';
export function ClinicianClientDetail({ slug }: { slug: string }) {
  const [client, setClient] = useState<any>(); const [appointments, setAppointments] = useState<any[]>([]); const [sessions, setSessions] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]); const [followups, setFollowups] = useState<any[]>([]); const [documents, setDocuments] = useState<any[]>([]);
  const [appointment, setAppointment] = useState(''); const [session, setSession] = useState(''); const [content, setContent] = useState(''); const [noteId, setNoteId] = useState<string | null>(null);
  const [followupId, setFollowupId] = useState<string | null>(null); const [date, setDate] = useState(''); const [remarks, setRemarks] = useState(''); const [status, setStatus] = useState('open');
  const [busy, setBusy] = useState(''); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const load = useCallback(async (patient: any) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const [schedule, sessionRows, noteRows, followupRows, docRows] = await Promise.all([
      clinicianRepository.schedule(), clinicianRepository.sessions(patient.id),
      supabase.from('patient_notes').select('id,content,created_at,doctor_appointment_id,related_session_id').eq('patient_id', patient.id).is('deleted_at', null).order('created_at', { ascending: false }),
      clinicianRepository.followups(patient.id), supabase.from('patient_documents').select('id,document_name,original_filename,category,document_date').eq('patient_id', patient.id).is('deleted_at', null).is('archived_at', null),
    ]);
    if (noteRows.error) throw noteRows.error; if (docRows.error) throw docRows.error;
    setAppointments(schedule.appointments.filter((row: any) => row.patient_id === patient.id)); setSessions(sessionRows); setNotes(noteRows.data || []); setFollowups(followupRows); setDocuments(docRows.data || []);
  }, []);
  useEffect(() => { let active = true; clinicianRepository.clients(slug).then(async rows => {
    if (!rows[0]) throw new Error('Client not found or access denied.'); if (active) { setClient(rows[0]); await load(rows[0]); }
  }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, [slug, load]);
  async function save(kind: 'note' | 'followup', event: FormEvent) {
    event.preventDefault(); setBusy(kind); setError(''); setNotice('');
    try { const relationship = { target_patient: client.id, target_appointment: appointment || null, target_session: session || null };
      if (kind === 'note') await clinicianRpc('save_clinician_note', { ...relationship, note_content: content, target_note: noteId });
      else await clinicianRpc('save_clinician_followup', { ...relationship, follow_up_date: date, operational_remarks: remarks, target_followup: followupId, next_status: status });
      setNotice(kind === 'note' ? 'Clinical note saved.' : 'Operational follow-up saved.'); await load(client); setNoteId(null); setFollowupId(null); setContent(''); setRemarks('');
    } catch (caught: any) { setError(caught.message || 'Unable to save.'); } finally { setBusy(''); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setBusy('upload'); setError('');
    try { const response = await fetch(`/api/patients/${client.id}/documents/upload`, { method: 'POST', body: new FormData(form) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await load(client); form.reset(); setNotice('Clinical document uploaded.'); }
    catch (caught: any) { setError(caught.message); } finally { setBusy(''); }
  }
  const relation = <div className="grid gap-3 md:grid-cols-2"><label>Related appointment<select className="input mt-1" value={appointment} onChange={event => setAppointment(event.target.value)}><option value="">Choose appointment</option>{appointments.map(row => <option value={row.id} key={row.id}>{new Date(row.start_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · {row.status}</option>)}</select></label><label>Related session (optional)<select className="input mt-1" value={session} onChange={event => setSession(event.target.value)}><option value="">No session</option>{sessions.map(row => <option value={row.id} key={row.id}>{row.session_type} · {row.appointment_at}</option>)}</select></label></div>;
  return <section className="space-y-5">{error && <p role="alert" className="rounded border border-rose-300 p-3">{error}</p>}{notice && <p role="status">{notice}</p>}{!client && !error && <p>Loading client…</p>}{client && <><h1 className="text-2xl font-bold">{client.full_name}</h1><p>{client.patient_number} · {client.phone || 'Phone not provided'}</p><p>{client.gender} · {client.preferred_language}</p>
    <div className="card space-y-3 p-5"><h2 className="text-lg font-semibold">My sessions</h2>{sessions.map(row => <p key={row.id}>{row.session_type} · {row.attendance_status} · {row.appointment_at}</p>)}{!sessions.length && <p>No sessions linked to your account.</p>}</div>
    {relation}<form className="card space-y-3 p-5" onSubmit={event => void save('note', event)}><h2 className="text-lg font-semibold">Private clinical notes</h2><label>Clinical note<textarea className="input mt-1" required maxLength={20000} value={content} onChange={event => setContent(event.target.value)} /></label><button className="btn btn-primary" disabled={!!busy}>{noteId ? 'Update note' : 'Save note'}</button>{noteId && <button className="btn border ml-2" type="button" onClick={() => { setNoteId(null); setContent(''); }}>Cancel edit</button>}{notes.map(row => <article className="border-t pt-3" key={row.id}><p className="whitespace-pre-wrap">{row.content}</p><button className="btn border mt-2" type="button" onClick={() => { setNoteId(row.id); setContent(row.content); setAppointment(row.doctor_appointment_id || ''); setSession(row.related_session_id || ''); }}>Edit own note</button></article>)}</form>
    <form className="card space-y-3 p-5" onSubmit={event => void save('followup', event)}><h2 className="text-lg font-semibold">Operational follow-ups</h2><p className="text-sm">Scheduling and contact updates are shared with the authorized operational team. Keep clinical details in your private notes.</p><label>Follow-up date<input className="input mt-1" type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><label>Operational remarks<textarea className="input mt-1" required maxLength={2000} value={remarks} onChange={event => setRemarks(event.target.value)} /></label><label>Status<select className="input mt-1" value={status} onChange={event => setStatus(event.target.value)}><option value="open">Open</option><option value="completed">Completed</option></select></label><button className="btn btn-primary" disabled={!!busy}>{followupId ? 'Update follow-up' : 'Save follow-up'}</button>{followups.map(row => <article className="border-t pt-3" key={row.id}><p>{row.follow_up_date} · {row.status}</p><p>{row.operational_remarks}</p><p className="text-sm">{row.psychologist} · Updated {row.updated_at}</p><button className="btn border mt-2" type="button" onClick={() => { setFollowupId(row.id); setAppointment(row.doctor_appointment_id); setSession(row.related_session_id || ''); setDate(row.follow_up_date); setRemarks(row.operational_remarks); setStatus(row.status); }}>Edit own follow-up</button></article>)}</form>
    <div className="card space-y-3 p-5"><h2 className="text-lg font-semibold">Clinical documents</h2>{documents.map(row => <article className="border-t pt-3" key={row.id}><b>{row.document_name}</b><p>{row.category} · {row.document_date}</p><PatientDocumentActions patientId={client.id} documentId={row.id} filename={row.original_filename} /></article>)}<form className="space-y-3" onSubmit={upload}><label>Document name<input className="input mt-1" name="documentName" required /></label><label>Category<select className="input mt-1" name="category">{['Case History', 'Session Records', 'Referral Forms', 'Clinical Documents'].map(value => <option key={value}>{value}</option>)}</select></label><input type="hidden" name="visibility" value="clinical_team" /><label>File<input className="input mt-1" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required /></label><button className="btn btn-primary" disabled={!!busy}>Upload clinical document</button></form></div>
  </>}</section>;
}
