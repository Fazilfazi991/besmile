'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { demoUser } from './demo-data';
import { demoDirectorEmployees } from './demo-director-data';

const initialProfile = { full_name: demoUser.full_name, email: demoUser.email, designation: demoUser.designation, phone: '' };

/** Public-demo profile is intentionally independent of employeeRepository and Storage. */
export function DemoProfile() {
  const [profile, setProfile] = useState(initialProfile);
  const [draft, setDraft] = useState(initialProfile);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { ...draft, full_name: draft.full_name.trim(), email: draft.email.trim(), designation: draft.designation.trim() };
    if (!next.full_name || !next.designation) { setNotice('Enter a name and designation before saving.'); return; }
    setProfile(next); setEditing(false); setNotice('Saved in this preview. Reload restores the fictional profile.');
  };
  return <section className="demo-profile space-y-6">
    <header className="demo-module-heading"><div><h1 className="text-2xl font-bold">My profile</h1><p className="text-slate-600">Your fictional Director profile and team. Preview changes stay on this page.</p></div><Link href="/admin" className="btn border">Back to overview</Link></header>
    {notice && <p className="demo-notice" role="status">{notice}</p>}
    <section className="card p-5" aria-labelledby="demo-profile-heading">
      <div className="demo-profile-summary"><span className="demo-avatar" aria-hidden="true">{profile.full_name.split(' ').slice(0,2).map(part=>part[0]).join('')}</span><div><h2 id="demo-profile-heading" className="text-xl font-semibold">{profile.full_name}</h2><p>{profile.designation}</p><span className="status-badge">Active · Fictional account</span></div></div>
      {editing ? <form onSubmit={save} className="demo-profile-form">
        <label>Full name<input autoFocus required maxLength={80} value={draft.full_name} onChange={event=>setDraft({...draft,full_name:event.target.value})} /></label>
        <label>Email<input required type="email" maxLength={120} value={draft.email} onChange={event=>setDraft({...draft,email:event.target.value})} /></label>
        <label>Designation<input required maxLength={80} value={draft.designation} onChange={event=>setDraft({...draft,designation:event.target.value})} /></label>
        <label>Phone (optional)<input type="tel" maxLength={30} value={draft.phone} onChange={event=>setDraft({...draft,phone:event.target.value})} /></label>
        <div className="demo-profile-actions"><button className="btn btn-primary" type="submit">Save preview</button><button className="btn border" type="button" onClick={()=>{setEditing(false);setDraft(profile);setNotice('');}}>Cancel</button></div>
      </form> : <><dl className="demo-profile-fields">{[['Email',profile.email],['Employee code','DEMO-EMP-001'],['Department','Operations'],['Role','Director'],['Phone',profile.phone||'Not set in this demo']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="demo-profile-actions"><button className="btn btn-primary" type="button" onClick={()=>{setDraft(profile);setNotice('');setEditing(true);}}>Edit preview profile</button><button className="btn border" type="button" onClick={()=>{setProfile(initialProfile);setDraft(initialProfile);setNotice('Fictional profile restored.');}}>Reset profile</button></div></>}
    </section>
    <section aria-labelledby="demo-profile-team"><h2 id="demo-profile-team" className="text-lg font-semibold mb-3">Team directory</h2><div className="demo-team-list">{demoDirectorEmployees.slice(1,5).map(member=><Link className="demo-team-row" key={member.id} href={`/admin/employees/${member.id}`}><span><b>{member.full_name}</b><small>{member.designation} · {member.department.name}</small></span><span>View profile</span></Link>)}</div></section>
    <p className="text-sm text-slate-600">Demo account only. Profile changes, file uploads and push delivery are not sent to a server.</p>
  </section>;
}
