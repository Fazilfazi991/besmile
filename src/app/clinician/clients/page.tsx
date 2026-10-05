'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clinicianRepository } from '@/lib/clinician-repository';
export default function ClinicianClientsPage() {
  const [clients, setClients] = useState<any[]>(); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  useEffect(() => { let active = true; clinicianRepository.clients().then(data => { if (active) setClients(data); }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  return <section className="space-y-5"><h1 className="text-2xl font-bold">My Clients</h1><label>Find an assigned client<input className="input mt-1" value={query} onChange={event => setQuery(event.target.value)} /></label>{error && <p role="alert">{error}</p>}{!clients && !error && <p>Loading clients…</p>}{clients?.filter(client => `${client.full_name} ${client.patient_number || ''}`.toLowerCase().includes(query.toLowerCase())).map(client => <article className="card p-5" key={client.id}><Link className="font-semibold underline" href={`/clinician/clients/${encodeURIComponent(client.slug)}`}>{client.full_name}</Link><p>{client.patient_number} · {client.phone || 'Phone not provided'}</p></article>)}{clients?.length === 0 && <p>No assigned clients.</p>}</section>;
}
