'use client';
import { FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import { clinicianRepository } from '@/lib/clinician-repository';
const labels: Record<string, string> = { full_name: 'Full name', phone: 'Phone', personal_email: 'Personal email', qualification: 'Qualification', specialization: 'Specialization', professional_information: 'Professional information' };
export function ClinicianProfileEditor({ doctorId }: { doctorId?: string }) {
  const [profile, setProfile] = useState<any>(); const [form, setForm] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<File>(); const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  useEffect(() => { let active = true; clinicianRepository.profile(doctorId).then(async value => {
    if (!value) throw new Error('Clinician profile unavailable.'); const url = await clinicianRepository.photoUrl(value.avatar_url);
    if (active) { setProfile(value); setForm(Object.fromEntries(Object.keys(labels).map(key => [key, value[key] || '']))); setPhotoUrl(url); }
  }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, [doctorId]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(''); setError('');
    try { const patch: Record<string, unknown> = { ...form }; if (photo) patch.avatar_url = await clinicianRepository.photo(profile.profile_id, photo);
      await clinicianRepository.saveProfile(profile.doctor_id, patch); setNotice('Clinician profile saved.'); setPhoto(undefined);
      const updated = await clinicianRepository.profile(doctorId); setProfile(updated); setPhotoUrl(await clinicianRepository.photoUrl(updated.avatar_url));
    } catch (caught: any) { setError(caught.message || 'Unable to save profile.'); } finally { setBusy(false); }
  }
  return <div className="space-y-4">{error && <p role="alert" className="rounded border border-rose-300 p-3">{error}</p>}{notice && <p role="status">{notice}</p>}{!profile && !error && <p>Loading profile…</p>}{profile && <form className="card grid gap-4 p-5 md:grid-cols-2" onSubmit={save}>
    {photoUrl && <Image unoptimized width={96} height={96} src={photoUrl} alt="Clinician profile" className="h-24 w-24 rounded-full object-cover" />}
    {Object.entries(labels).map(([key, label]) => <label className="text-sm font-medium" key={key}>{label}{key === 'professional_information' ? <textarea className="input mt-1" maxLength={4000} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /> : <input className="input mt-1" required={key === 'full_name'} type={key === 'personal_email' ? 'email' : 'text'} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} />}</label>)}
    {profile.profile_id && <label className="text-sm font-medium">Profile photo<input className="input mt-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setPhoto(event.target.files?.[0])} /></label>}
    <div className="md:col-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div></form>}</div>;
}
