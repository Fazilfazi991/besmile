'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clinicianRepository, clinicianRpc } from '@/lib/clinician-repository';
import { BUSINESS_TIME_ZONE } from '@/lib/business-time';
export default function ClinicianSchedulePage() {
  const [data, setData] = useState<any>(); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({}); const [requests, setRequests] = useState<Record<string, string>>({});
  useEffect(() => { let active = true; clinicianRepository.schedule().then(value => { if (active) setData(value); }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  async function respond(id: string, decision: string) {
    setBusy(id); setError(''); const version = data.appointments.find((row: any) => row.id === id)?.assignment_version; const key = `${id}:${decision}:${version}`; const requestId = requests[key] || crypto.randomUUID();
    setRequests(current => ({ ...current, [key]: requestId }));
    try { await clinicianRpc('respond_to_clinician_appointment', { target_appointment: id, decision, request_id: requestId, rejection_reason: decision === 'rejected' ? reason[id] || null : null }); setData(await clinicianRepository.schedule()); }
    catch (caught: any) { setError(caught.message || 'Unable to respond.'); } finally { setBusy(''); }
  }
  const date = (value: string) => new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return <section className="space-y-5"><h1 className="text-2xl font-bold">My Schedule</h1><p>Times shown in {BUSINESS_TIME_ZONE}.</p>{error && <p role="alert" className="rounded border border-rose-300 p-3">{error}</p>}{!data && !error && <p>Loading schedule…</p>}
    {data?.appointments?.length === 0 && <p className="card p-5">No assigned appointments.</p>}
    {data?.appointments?.map((appointment: any) => <article className="card space-y-3 p-5" key={appointment.id}>
      <Link className="font-semibold underline" href={`/clinician/clients/${encodeURIComponent(appointment.patient_slug)}`}>{appointment.patient_name}</Link>
      <p>{date(appointment.start_at)} – {date(appointment.end_at)}</p><p>{appointment.consultation_type.replaceAll('_', ' ')} · {appointment.status}</p>
      <p className="font-medium">{appointment.clinician_response === 'rejected' ? 'Rejected — awaiting reassignment' : appointment.clinician_response === 'accepted' ? 'Accepted' : 'Pending clinician response'}</p>{appointment.response_reason && <p>{appointment.response_reason}</p>}
      {['scheduled', 'rescheduled', 'confirmed'].includes(appointment.status) && <div className="flex flex-wrap gap-3">
        {['scheduled', 'rescheduled'].includes(appointment.status) && <button className="btn btn-primary" disabled={busy === appointment.id} onClick={() => void respond(appointment.id, 'accepted')}>Accept</button>}
        <label className="min-w-0 flex-1 text-sm">Rejection reason (optional)<input className="input mt-1" maxLength={500} value={reason[appointment.id] || ''} onChange={event => setReason({ ...reason, [appointment.id]: event.target.value })} /></label><button className="btn border" disabled={busy === appointment.id} onClick={() => void respond(appointment.id, 'rejected')}>Reject</button>
      </div>}
    </article>)}
    {data && <div className="card space-y-3 p-5"><h2 className="text-lg font-semibold">Availability</h2><p>Your scheduling manager maintains these times.</p>{data.availability.map((range: any) => <p key={range.id}>{days[range.day_of_week]} · {range.start_time.slice(0, 5)}–{range.end_time.slice(0, 5)}</p>)}{!data.availability.length && <p>No weekly availability configured.</p>}<h3 className="font-semibold">Blocked periods</h3>{data.blocked_periods.map((block: any, index: number) => <p key={index}>{block.blocked_date} · {block.start_time ? `${block.start_time}–${block.end_time}` : 'Full day'}</p>)}{!data.blocked_periods.length && <p>No blocked periods.</p>}</div>}
  </section>;
}
