'use client';
import { FormEvent, useEffect, useState } from 'react';
import { clinicianRpc } from '@/lib/clinician-repository';
import { supabase } from '@/lib/supabase';
import { ClinicianProfileEditor } from './clinician-profile-editor';
export function OutsourcedClinicianManagement() {
  const [doctors, setDoctors] = useState<any[]>([]); const [doctorId, setDoctorId] = useState(''); const [ranges, setRanges] = useState<any[]>([]);
  const [allowed, setAllowed] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''); const [fullName, setFullName] = useState(''); const [requestId, setRequestId] = useState('');
  const [blockDate, setBlockDate] = useState(''); const [blockStart, setBlockStart] = useState(''); const [blockEnd, setBlockEnd] = useState(''); const [blockReason, setBlockReason] = useState('');
  const load = async () => { const rows = await clinicianRpc<any[]>('outsourced_clinician_directory'); setDoctors(rows); };
  useEffect(() => { let active = true; clinicianRpc<boolean>('has_permission', { permission_code: 'outsourced_clinicians.manage' }).then(async value => {
    if (!value) throw new Error('Outsourced manager permission required.'); if (active) { setAllowed(true); await load(); }
  }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  const doctor = doctors.find(row => row.id === doctorId);
  function choose(id: string) { const row = doctors.find(item => item.id === id); setDoctorId(id); setRanges(row?.availability || []); setFullName(row?.doctor_name || ''); setEmail(''); setRequestId(crypto.randomUUID()); setNotice(''); setError(''); }
  async function availability(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await clinicianRpc('replace_clinician_availability', { target_doctor: doctorId, ranges: ranges.map(({ day_of_week, start_time, end_time }) => ({ day_of_week: Number(day_of_week), start_time, end_time })) }); await load(); setNotice('Availability saved.'); } catch (caught: any) { setError(caught.message); } finally { setBusy(false); } }
  async function provision(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try {
    const response = await fetch('/api/clinicians/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId, email, requestId, fields: { full_name: fullName } }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await load(); setNotice('Account linked to this clinician. Private password onboarding is required at first sign-in.');
  } catch (caught: any) { setError(caught.message); } finally { setBusy(false); } }
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
    {!doctor.profile_id && <form className="card space-y-3 p-5" onSubmit={provision}><h2 className="text-lg font-semibold">Create clinician login</h2><label>Approved full name<input className="input mt-1" required value={fullName} disabled={busy} onChange={event => setFullName(event.target.value)} /></label><label>Approved login email<input className="input mt-1" type="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create and link account'}</button></form>}
    <form className="card space-y-3 p-5" onSubmit={availability}><h2 className="text-lg font-semibold">Weekly availability</h2><p>Times use Asia/Kolkata.</p>{ranges.map((range, index) => <div key={index} className="flex flex-wrap gap-2"><label>Day<select className="input" value={range.day_of_week} onChange={event => setRanges(ranges.map((row, i) => i === index ? { ...row, day_of_week: Number(event.target.value) } : row))}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>{['start_time', 'end_time'].map(field => <label key={field}>{field === 'start_time' ? 'From' : 'To'}<input type="time" className="input" required value={range[field]?.slice(0, 5)} onChange={event => setRanges(ranges.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row))} /></label>)}<button className="btn border" type="button" onClick={() => setRanges(ranges.filter((_, i) => i !== index))}>Remove range</button></div>)}<div className="flex gap-3"><button className="btn border" type="button" onClick={() => setRanges([...ranges, { day_of_week: 1, start_time: '09:00', end_time: '17:00' }])}>Add range</button><button className="btn btn-primary" disabled={busy}>Save availability</button></div></form>
    <form className="card space-y-3 p-5" onSubmit={event => { event.preventDefault(); void changeBlock(); }}><h2 className="text-lg font-semibold">Blocked periods</h2><p>Leave both times blank to block the full day. Times use Asia/Kolkata.</p><div className="flex flex-wrap gap-3"><label>Date<input className="input" required type="date" value={blockDate} onChange={event => setBlockDate(event.target.value)} /></label><label>From<input className="input" type="time" value={blockStart} onChange={event => setBlockStart(event.target.value)} /></label><label>To<input className="input" type="time" value={blockEnd} onChange={event => setBlockEnd(event.target.value)} /></label></div><label>Reason<input className="input" value={blockReason} onChange={event => setBlockReason(event.target.value)} /></label><button className="btn btn-primary" disabled={busy}>Add blocked period</button><ul className="space-y-2">{doctor.blocked_periods?.map((block: any) => <li key={block.id} className="flex flex-wrap items-center justify-between gap-2"><span>{block.blocked_date} · {block.start_time ? `${block.start_time.slice(0,5)}–${block.end_time.slice(0,5)}` : 'Full day'} {block.reason}</span><button className="btn border" type="button" disabled={busy} onClick={() => void changeBlock(block.id)}>Remove blocked period</button></li>)}</ul></form>
  </>}</>}</section>;
}
