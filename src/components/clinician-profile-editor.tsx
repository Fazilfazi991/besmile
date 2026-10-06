'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { clinicianRepository } from '@/lib/clinician-repository';
import { PHOTO_UNLINKED, validateClinicianPhoto } from '@/lib/clinician-photo-rules';
const labels: Record<string, string> = { full_name: 'Full name', phone: 'Phone', personal_email: 'Personal email', qualification: 'Qualification', specialization: 'Specialization', professional_information: 'Professional information' };
export function ClinicianProfileEditor({ doctorId }: { doctorId?: string }) {
  const [profile, setProfile] = useState<any>(); const [form, setForm] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<File>(); const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null); const [photoError, setPhotoError] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  useEffect(() => { let active = true; clinicianRepository.profile(doctorId).then(async value => {
    if (!value) throw new Error('Clinician profile unavailable.'); const url = await clinicianRepository.photoUrl(value.avatar_url);
    if (active) { setProfile(value); setForm(Object.fromEntries(Object.keys(labels).map(key => [key, value[key] || '']))); setPhotoUrl(url); }
  }).catch(caught => { if (active) setError(caught.message); }); return () => { active = false; }; }, [doctorId]);
  useEffect(() => {
    let active = true; let url: string | undefined;
    if (photo) validateClinicianPhoto(photo).then(() => { if (active) { url = URL.createObjectURL(photo); setPreview(url); } })
      .catch(caught => { if (active) setPhotoError(caught.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [photo]);
  function selectPhoto(file?: File) { setPhoto(file); setPreview(null); setPhotoError(''); setError(''); }
  function removeSelectedPhoto() { selectPhoto(); if (photoInput.current) photoInput.current.value = ''; }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(''); setError('');
    try { const patch: Record<string, unknown> = { ...form }; if (photo instanceof File) patch.avatar_url = await clinicianRepository.photo(profile.profile_id, photo);
      await clinicianRepository.saveProfile(profile.doctor_id, patch); setNotice('Clinician profile saved.'); removeSelectedPhoto();
      const updated = await clinicianRepository.profile(doctorId); setProfile(updated); setPhotoUrl(await clinicianRepository.photoUrl(updated.avatar_url));
    } catch (caught: any) { setError(caught.message || 'Unable to save profile.'); } finally { setBusy(false); }
  }
  return <div className="space-y-4">{error && <p role="alert" className="rounded border border-rose-300 p-3">{error}</p>}{notice && <p role="status">{notice}</p>}{!profile && !error && <p>Loading profile…</p>}{profile && <form className="card grid min-w-0 gap-4 p-5 md:grid-cols-2" onSubmit={save}>
    {(preview || photoUrl) && <Image unoptimized width={96} height={96} src={preview || photoUrl!} alt={preview ? 'Selected photo preview' : 'Clinician profile'} className="h-24 w-24 rounded-full object-cover" />}
    {Object.entries(labels).map(([key, label]) => <label className="text-sm font-medium" key={key}>{label}{key === 'professional_information' ? <textarea className="input mt-1" maxLength={4000} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /> : <input className="input mt-1" required={key === 'full_name'} type={key === 'personal_email' ? 'email' : 'text'} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} />}</label>)}
    <div className="min-w-0 space-y-2 text-sm"><label className="font-medium">Profile photo (optional)<input ref={photoInput} className="input mt-1 w-full min-w-0 max-w-full" type="file" disabled={busy || !profile.profile_id} accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/jpg,image/png,image/webp" onChange={event => selectPhoto(event.target.files?.[0])} /></label>
      {!profile.profile_id ? <p>{PHOTO_UNLINKED}</p> : <p>JPG, JPEG, PNG or WebP, up to 5 MB. Leave empty to keep the current photo.</p>}
      {photo && <><p className="break-all">{photo.name} · {(photo.size / 1024 / 1024).toFixed(2)} MB</p><button className="btn border" type="button" disabled={busy} onClick={removeSelectedPhoto}>Remove selected photo</button></>}
      {photoError && <p role="alert" className="text-rose-700 [html[data-theme=colorful]_&]:text-rose-200">{photoError}</p>}
    </div>
    <div className="md:col-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div></form>}</div>;
}
