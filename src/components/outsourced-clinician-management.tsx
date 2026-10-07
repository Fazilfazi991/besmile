'use client';
import { FormEvent, useEffect, useState } from 'react';
import { clinicianRpc } from '@/lib/clinician-repository';
import { WeeklyAvailabilityEditor } from './weekly-availability-editor';
import type { AvailabilityRange } from '@/lib/doctor-scheduling-rules';
import { supabase } from '@/lib/supabase';
import { ClinicianProfileEditor } from './clinician-profile-editor';
import { OneTimeTemporaryPassword } from './one-time-temporary-password';
export function OutsourcedClinicianManagement() {
  const [doctors, setDoctors] = useState<any[]>([]); const [doctorId, setDoctorId] = useState('');
  const [allowed, setAllowed] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''); const [fullName, setFullName] = useState(''); const [requestId, setRequestId] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [credentialStatus, setCredentialStatus] = useState('');
  const [blockDate, setBlockDate] = useState(''); const [blockStart, setBlockStart] = useState(''); const [blockEnd, setBlockEnd] = useState(''); const [blockReason, setBlockReason] = useState('');
  const load = async () => {
    const rows = await clinicianRpc<any[]>('outsourced_clinician_directory');
    if (!rows.length) { setDoctors([]); return; }
    if (!supabase) throw new Error('Supabase is not configured.');
    // The directory projection omits consultation duration. Read it under existing RLS
    // rather than assume a shorter duration when validating the weekly editor.
    const result = await supabase.from('outsourced_doctors').select('id,consultation_duration_minutes').in('id', rows.map(row => row.id));
    if (result.error) throw result.error;
    const durations = new Map<string, number>(result.data.map((row: { id: string; consultation_duration_minutes: number }) => [row.id, row.consultation_duration_minutes]));
    if (rows.some(row => !(Number(durations.get(row.id)) > 0))) throw new Error('Consultation durations could not be loaded. Reload before editing availability.');
    setDoctors(rows.map(row => ({ ...row, consultation_duration_minutes: durations.get(row.id) })));
  };
  useEffect(() => { let active = true; clinicianRpc<boolean>('has_permission', { permission_code: 'outsourced_clinicians.manage' }).then(async value => {
    if (!value) throw new Error('Outsourced manager permission required.'); if (active) { setAllowed(true); await load(); }
  }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  const doctor = doctors.find(row => row.id === doctorId);
  useEffect(() => {
    if (!doctorId || !doctor?.profile_id) return;
    let active = true;
    clinicianRpc<string>('clinician_temporary_credential_status', { target_doctor: doctorId })
      .then(value => { if (active) setCredentialStatus(value); })
      .catch(() => { if (active) setCredentialStatus('manual_review'); });
    return () => { active = false; };
  }, [doctorId, doctor?.profile_id]);
  useEffect(() => {
    const clear = () => { if (document.hidden) setTemporaryPassword(null); };
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);
  function choose(id: string) { const row = doctors.find(item => item.id === id); setTemporaryPassword(null); setCredentialStatus(''); setDoctorId(id); setFullName(row?.doctor_name || ''); setEmail(''); setRequestId(crypto.randomUUID()); setNotice(''); setError(''); }
  async function availability(ranges: AvailabilityRange[]) {
    setBusy(true); setError(''); setNotice('');
    try {
      await clinicianRpc('replace_clinician_availability', { target_doctor: doctorId, ranges });
    } catch (caught: any) {
      setError(caught.message); throw new Error(caught.message || 'Unable to save availability.');
    } finally { setBusy(false); }
    // Persistence succeeded even if a subsequent directory refresh fails.
    try { await load(); } catch { setNotice('Availability saved. Reload the page to refresh the directory.'); }
  }
  async function provision(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try {
    setTemporaryPassword(null);
    const response = await fetch('/api/clinicians/provision', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId, email, requestId, fields: { full_name: fullName } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!document.hidden) setTemporaryPassword(result.temporaryPassword || null); await load(); setNotice('Account linked to this clinician. Private password onboarding is required at first sign-in.');
  } catch (caught: any) { setError(caught.message); } finally { setBusy(false); } }
  async function regenerate() {
    setBusy(true); setError(''); setTemporaryPassword(null);
    try {
      const response = await fetch('/api/clinicians/temporary-credential', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId, requestId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!document.hidden) setTemporaryPassword(result.temporaryPassword || null);
      setNotice(result.replayed ? 'This request was already completed. Its password cannot be displayed again.' : 'New temporary login password generated. Private password onboarding is still required.');
      setCredentialStatus('generated');
    } catch (caught: any) { setError(caught.message); setCredentialStatus('manual_review'); }
    finally { setBusy(false); }
  }
  async function changeBlock(id?: string) {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      if (!id && ((!blockStart !== !blockEnd) || (blockStart && blockStart >= blockEnd))) throw new Error('Enter both times in order, or leave both blank for the full day.');
      const user = (await supabase.auth.getUser()).data.user;
      const result = id ? await supabase.from('doctor_blocked_periods').delete().eq('id', id)
        : await supabase.from('doctor_blocked_periods').insert({ doctor_id: doctorId, blocked_date: blockDate, start_time: blockStart || null, end_time: blockEnd || null, reason: blockReason.trim() || null, created_by: user?.id });
      if (result.error) throw result.error;
      await load(); setNotice(id ? 'Blocked period removed.' : 'Blocked period added.');
    } catch (caught: any) { setError(caught.message); } finally { setBusy(false); }
  }
  return <section className="space-y-5"><h1 className="text-2xl font-bold">Online Psychologists</h1>{error && <p role="alert" className="rounded border border-rose-300 p-3">{error}</p>}{notice && <p role="status">{notice}</p>}{allowed && <><label>Existing outsourced clinician<select className="input mt-1" value={doctorId} onChange={event => choose(event.target.value)} disabled={busy}><option value="">Choose clinician</option>{doctors.map(row => <option key={row.id} value={row.id}>{row.doctor_name}</option>)}</select></label>{doctor && <>
    <ClinicianProfileEditor key={doctorId} doctorId={doctorId} />
    {temporaryPassword && <OneTimeTemporaryPassword key={requestId} password={temporaryPassword} onDismiss={() => setTemporaryPassword(null)} />}
    {doctor.profile_id && <section className="card space-y-3 p-5" aria-label="Temporary login credential"><h2 className="text-lg font-semibold">Temporary login credential</h2><p>{credentialStatus === 'onboarding_complete' ? 'Private password onboarding is complete. Temporary password generation is unavailable.' : credentialStatus === 'manual_review' ? 'This account requires manual credential review before a password change.' : credentialStatus === 'eligible' ? 'Onboarding is required and this account has never signed in. This action changes only its login password.' : credentialStatus === 'generated' ? 'This request is complete. Hand over the credential privately before leaving this page.' : 'Checking account eligibility…'}</p><button type="button" className="btn border" disabled={busy || credentialStatus !== 'eligible'} onClick={() => void regenerate()}>Generate new temporary login password</button></section>}
    {!doctor.profile_id && <form className="card space-y-3 p-5" onSubmit={provision}><h2 className="text-lg font-semibold">Create clinician login</h2><label>Approved full name<input className="input mt-1" required value={fullName} disabled={busy} onChange={event => setFullName(event.target.value)} /></label><label>Approved login email<input className="input mt-1" type="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create and link account'}</button></form>}
    <WeeklyAvailabilityEditor key={doctorId} initialRanges={doctor.availability || []} consultationDurationMinutes={doctor.consultation_duration_minutes || 5} disabled={busy} onSave={availability} />
    <form className="card space-y-3 p-5" onSubmit={event => { event.preventDefault(); void changeBlock(); }}><h2 className="text-lg font-semibold">Blocked periods</h2><p>Leave both times blank to block the full day. Times use Asia/Kolkata.</p><div className="flex flex-wrap gap-3"><label>Date<input className="input" required type="date" value={blockDate} onChange={event => setBlockDate(event.target.value)} /></label><label>From<input className="input" type="time" value={blockStart} onChange={event => setBlockStart(event.target.value)} /></label><label>To<input className="input" type="time" value={blockEnd} onChange={event => setBlockEnd(event.target.value)} /></label></div><label>Reason<input className="input" value={blockReason} onChange={event => setBlockReason(event.target.value)} /></label><button className="btn btn-primary" disabled={busy}>Add blocked period</button><ul className="space-y-2">{doctor.blocked_periods?.map((block: any) => <li key={block.id} className="flex flex-wrap items-center justify-between gap-2"><span>{block.blocked_date} · {block.start_time ? `${block.start_time.slice(0,5)}–${block.end_time.slice(0,5)}` : 'Full day'} {block.reason}</span><button className="btn border" type="button" disabled={busy} onClick={() => void changeBlock(block.id)}>Remove blocked period</button></li>)}</ul></form>
  </>}</>}</section>;
}
