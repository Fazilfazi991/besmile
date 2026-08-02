'use client';
/* The async Supabase query updates state only after it resolves. */
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-html-link-for-pages */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isDemoPatient } from '@/lib/demo-patient';

const db: any = supabase;

type PatientListProps = { basePath?: string; canCreate?: boolean; title?: string; description?: string };

export function PatientList({ basePath = '/admin/patients', canCreate = true, title = 'Patients', description = 'Patient records and administrative documents.' }: PatientListProps) {
  const [patients, setPatients] = useState<any[]>([]); const [query, setQuery] = useState(''); const [error, setError] = useState('');
  const load = async (value = query) => { let request = db.from('patients').select('*,assigned:profiles!patients_assigned_psychologist_id_fkey(full_name)').is('deleted_at',null).order('created_at',{ascending:false}).limit(50); if(value) request=request.or(`full_name.ilike.%${value}%,patient_number.ilike.%${value}%,phone.ilike.%${value}%,email.ilike.%${value}%`); const {data,error}=await request; if(error)setError('Unable to load patients.');else {setPatients(data||[]);setError('');} };
  useEffect(()=>{void load('');},[]);
  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">{title}</h1><p className="text-slate-600">{description}</p></div>{canCreate&&<a className="rounded bg-slate-900 px-4 py-2 text-white" href="/admin/patients/new">Add patient</a>}</div><form className="card flex gap-3 p-4" onSubmit={event=>{event.preventDefault();void load();}}><input aria-label="Search patients" className="rounded border p-2" placeholder="Name, ID, phone or email" value={query} onChange={event=>setQuery(event.target.value)}/><button className="rounded border px-3">Search</button></form>{error?<div className="card p-5 text-rose-700">{error}</div>:!patients.length?<div className="card p-8 text-center text-slate-600">No patients match these filters.</div>:<div className="card overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b text-left text-slate-500"><tr>{['Patient ID','Patient','Phone','Email','Assigned clinician','Status','Actions'].map(label=><th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{patients.map(patient=><tr className="border-b" key={patient.id}><td className="p-3">{patient.patient_number}{isDemoPatient(patient)&&<span className="ml-2 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Demo</span>}</td><td className="p-3 font-medium">{patient.full_name}</td><td className="p-3">{patient.phone||'—'}</td><td className="p-3">{patient.email||'—'}</td><td className="p-3">{patient.assigned?.full_name||'Unassigned'}</td><td className="p-3 capitalize">{patient.status}</td><td className="p-3"><a className="underline" href={`${basePath}/${patient.id}`}>Open</a></td></tr>)}</tbody></table></div>}</section>;
}
