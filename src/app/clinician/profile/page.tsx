'use client';

import { FormEvent, useEffect, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { BrowserPushSettings } from '@/components/browser-push-settings';
import { PasswordChangeForm } from '@/components/password-change-form';

export default function ClinicianProfilePage() {
  const [profile, setProfile] = useState<any>();
  const [form, setForm] = useState({ full_name: '', phone: '', personal_email: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const me = await currentProfile() as any;
      if (!me) throw new Error('Your session has expired.');
      const data = await employeeRepository.profile(me.id);
      setProfile(data);
      setForm({ full_name: data.full_name || '', phone: data.phone || '', personal_email: data.personal_email || '' });
    } catch (caught: any) { setError(caught.message || 'Unable to load your profile.'); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    try { await employeeRepository.updateMyProfile(profile.id, form); setNotice('Profile saved.'); await load(); }
    catch (caught: any) { setError(caught.message || 'Unable to save your profile.'); }
  };
  if (!profile) return <section><h1 className="text-2xl font-bold">Profile</h1><p className="mt-3">{error || 'Loading profile...'}</p></section>;
  return <section className="space-y-5"><div><h1 className="text-2xl font-bold">Clinician Profile</h1><p className="text-slate-600">Account and contact settings. This is not an employee or payroll record.</p></div>{notice && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{notice}</p>}{error && <p className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}<form className="card grid gap-4 p-5 md:grid-cols-2" onSubmit={save}><label className="text-sm font-medium">Full name<input className="input mt-1" required value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })} /></label><label className="text-sm font-medium">Phone<input className="input mt-1" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label><label className="text-sm font-medium">Personal email<input className="input mt-1" type="email" value={form.personal_email} onChange={event => setForm({ ...form, personal_email: event.target.value })} /></label><div className="md:col-span-2"><button className="btn btn-primary">Save profile</button></div></form><PasswordChangeForm /><BrowserPushSettings /></section>;
}
