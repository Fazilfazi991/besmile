'use client';
/* The async Supabase query updates state only after it resolves. */
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { currentProfile } from '@/lib/auth';
import { isDemoPatient } from '@/lib/demo-patient';
import { patientPath } from '@/lib/patient-slug';
import { patientSourceLabel, patientSourceOptions } from '@/lib/patient-source';

const db: any = supabase;

type PatientListProps = { basePath?: string; canCreate?: boolean; title?: string; description?: string; assignedOnly?: boolean };

export function PatientList({ basePath = '/admin/patients', canCreate = true, title = 'Clients', description = 'Client records and administrative documents.', assignedOnly = false }: PatientListProps) {
  const [patients, setPatients] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [canEdit, setCanEdit] = useState(false);

  const load = async (value = query) => {
    let request = db.from('patients').select('*,assigned:profiles!patients_assigned_psychologist_id_fkey(full_name)').is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
    if (assignedOnly) {
      const profile = await currentProfile();
      if (!profile) { setPatients([]); return; }
      const assignmentResult = await db.from('patient_access_assignments').select('patient_id').eq('profile_id', profile.id).lte('starts_at', new Date().toISOString()).or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);
      const assignedIds = (assignmentResult.data || []).map((row: any) => row.patient_id);
      const filters = [`assigned_psychologist_id.eq.${profile.id}`, ...assignedIds.map((id: string) => `id.eq.${id}`)];
      request = request.or(filters.join(','));
    }
    if (value) request = request.or(`full_name.ilike.%${value}%,patient_number.ilike.%${value}%,phone.ilike.%${value}%,email.ilike.%${value}%`);
    if (source) request = request.eq('source', source);
    const { data, error } = await request;
    if (error) setError('Unable to load clients.');
    else { setPatients(data || []); setError(''); }
  };

  useEffect(() => {
    void load('');
    void db.rpc('has_permission', { permission_code: 'patients.edit' }).then(({ data }: { data: boolean }) => setCanEdit(!!data));
  }, []);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1><p className="text-slate-600">{description}</p></div>
      {canCreate && <a className="rounded bg-slate-900 px-4 py-2 text-white" href="/admin/patients/new">Add client</a>}
    </div>
    <form className="card flex gap-3 p-4" onSubmit={event => { event.preventDefault(); void load(); }}>
      <input aria-label="Search clients" className="rounded border p-2" placeholder="Name, ID, phone or email" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="Source" className="rounded border p-2" value={source} onChange={event => setSource(event.target.value)}>
        <option value="">All sources</option>
        {patientSourceOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
      <button className="rounded border px-3">Search</button>
    </form>
    {error ? <div className="card p-5 text-rose-700">{error}</div> : !patients.length ? <div className="card p-8 text-center text-slate-600">No clients match these filters.</div> : <div className="card overflow-x-auto"><table className="min-w-full text-sm">
      <thead className="border-b text-left text-slate-500"><tr>{['Client ID', 'Client', 'Phone', 'Email', 'Source', 'Assigned clinician', 'Status', 'Actions'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
      <tbody>{patients.map(patient => <tr className="border-b" key={patient.id}>
        <td className="p-3">{patient.patient_number}{isDemoPatient(patient) && <span className="ml-2 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Demo</span>}</td>
        <td className="p-3 font-medium">{patient.full_name}</td>
        <td className="p-3">{patient.phone || '-'}</td>
        <td className="p-3">{patient.email || '-'}</td>
        <td className="p-3">{patientSourceLabel(patient.source) || '-'}</td>
        <td className="p-3">{patient.assigned?.full_name || 'Unassigned'}</td>
        <td className="p-3 capitalize">{patient.status}</td>
        <td className="p-3"><a className="underline" href={patientPath(basePath, patient)}>Open</a>{canEdit && <a className="ml-3 underline" href={`${patientPath(basePath, patient)}?edit=1`}>Edit</a>}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
