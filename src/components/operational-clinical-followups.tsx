'use client';
import { useEffect, useState } from 'react';
import { clinicianRepository } from '@/lib/clinician-repository';
export function OperationalClinicalFollowups() {
  const [rows, setRows] = useState<any[]>(); const [error, setError] = useState('');
  useEffect(() => { let active = true; clinicianRepository.followups().then(value => { if (active) setRows(value); }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  return <section className="space-y-5"><h1 className="text-2xl font-bold">Clinical Follow-ups</h1>{error && <p role="alert">{error}</p>}{!rows && !error && <p>Loading follow-ups…</p>}{rows?.length === 0 && <p>No operational follow-ups.</p>}{rows?.map(row => <article className="card space-y-2 p-5" key={row.id}><h2 className="font-semibold">{row.patient_name} · {row.patient_number}</h2><p>{row.follow_up_date} · {row.status}</p><p>{row.operational_remarks}</p><small>{row.psychologist} · Updated {row.updated_at}</small></article>)}</section>;
}
