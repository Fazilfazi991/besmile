'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adminRepository } from '@/lib/admin-repository';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';

const permissionLabels = { 'tasks.assign': 'Manage Tasks', 'tasks.manage_access': 'Task Assignment Access' } as const;

export default function TaskAccessPage() {
  const [profile, setProfile] = useState<any>();
  const [grants, setGrants] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [employee, setEmployee] = useState<any>();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [permissionCode, setPermissionCode] = useState<'tasks.assign' | 'tasks.manage_access'>('tasks.assign');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const p = await currentProfile() as any;
      if (!p || !(await employeeRepository.hasPermission('tasks.manage_access'))) throw Error('You do not have permission to manage task-assignment access.');
      setProfile(p); await adminRepository.recordExpiredTaskPermissions(); setGrants(await adminRepository.taskPermissionGrants()); setError('');
    } catch (e: any) { setError(e.message || 'Unable to load task access.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
  const lookup = async () => {
    setMessage(''); setError(''); setEmployee(undefined); setCandidates([]);
    try {
      const found = await adminRepository.searchActiveEmployees(email);
      if (!found.length) {
        const exact = await adminRepository.activeEmployeeByEmail(email);
        if (exact?.status === 'inactive') throw Error('This employee account is inactive and cannot receive access.');
        throw Error('No active BSmile employee account was found for that name or email.');
      }
      if (found.length === 1) setEmployee(found[0]); else setCandidates(found);
    } catch (e: any) { setError(e.message); }
  };
  const grant = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage(''); setError('');
    try {
      if (!employee) throw Error('Look up an active employee before granting access.');
      const starts = new Date(`${startsAt}T00:00:00`).toISOString();
      const expires = expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null;
      if (expires && expires <= starts) throw Error('Expiry must be after the access start date.');
      await adminRepository.grantTaskPermission({ profile_id: employee.id, permissionCode, granted_by: profile.id, starts_at: starts, expires_at: expires, reason });
      setMessage(`Access granted to ${employee.full_name}.`); setEmail(''); setEmployee(undefined); setReason(''); setExpiresAt(''); await load();
    } catch (e: any) { setError(e.message || 'Unable to grant access.'); }
    finally { setSaving(false); }
  };
  const shown = useMemo(() => grants.filter(grant => `${grant.profile?.full_name || ''} ${grant.profile?.email || ''}`.toLowerCase().includes(query.toLowerCase())), [grants, query]);
  if (loading) return <p>Loading task assignment access…</p>;
  if (error && !profile) return <p className="text-rose-700">{error}</p>;
  return <section className="space-y-6">
    <div><h1 className="text-2xl font-bold">Task Assignment Access</h1><p className="text-slate-600">Grant temporary or ongoing task-management access to active employees.</p></div>
    {message && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{message}</p>}{error && <p className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}
    <form onSubmit={grant} className="card grid gap-3 p-5 md:grid-cols-2">
      <div className="flex gap-2"><input className="min-w-0 flex-1 rounded border p-2" required value={email} placeholder="Employee name or work email" onChange={e => setEmail(e.target.value)} /><button className="rounded border px-3" type="button" onClick={lookup}>Find</button></div>
      <div className="self-center text-sm text-slate-600">{employee ? <><b>{employee.full_name}</b> · {employee.email}</> : candidates.length ? <span className="flex flex-wrap gap-2">{candidates.map(candidate => <button type="button" className="rounded border px-2 py-1" onClick={() => { setEmployee(candidate); setCandidates([]); }} key={candidate.id}>{candidate.full_name} · {candidate.email}</button>)}</span> : 'Find an active employee to continue.'}</div>
      <select className="rounded border p-2" value={permissionCode} onChange={e => setPermissionCode(e.target.value as keyof typeof permissionLabels)}>{Object.entries(permissionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input className="rounded border p-2" value={reason} placeholder="Reason (optional)" onChange={e => setReason(e.target.value)} />
      <label className="text-sm">Access start<input required type="date" className="mt-1 block w-full rounded border p-2" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></label>
      <label className="text-sm">Access expiry (optional)<input type="date" className="mt-1 block w-full rounded border p-2" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
      <button disabled={saving} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60 md:col-span-2">{saving ? 'Granting…' : 'Grant access'}</button>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Access history</h2><input className="rounded border p-2 text-sm" placeholder="Search name or email" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="card overflow-x-auto"><table className="min-w-[900px] table"><thead><tr><th>Employee</th><th>Access</th><th>Granted by</th><th>Granted</th><th>Period</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{shown.map(grant => { const expired = !grant.revoked_at && grant.expires_at && new Date(grant.expires_at) <= new Date(); const status = grant.revoked_at ? 'Revoked' : expired ? 'Expired' : 'Active'; return <tr key={grant.id}><td><b>{grant.profile?.full_name || 'Employee'}</b><br /><small>{grant.profile?.email}</small></td><td>{permissionLabels[grant.permission?.code as keyof typeof permissionLabels] || grant.permission?.code}</td><td>{grant.granter?.full_name || 'System'}</td><td>{new Date(grant.granted_at).toLocaleString()}</td><td>{new Date(grant.starts_at).toLocaleDateString()} – {grant.expires_at ? new Date(grant.expires_at).toLocaleDateString() : 'No expiry'}</td><td>{grant.reason || '—'}</td><td><span className={status === 'Active' ? 'text-emerald-700' : 'text-slate-600'}>{status}</span></td><td>{status === 'Active' && <button className="rounded border px-2 py-1 text-sm" onClick={async () => { try { await adminRepository.revokeTaskPermission(grant.id, profile.id); setMessage(`Access revoked for ${grant.profile?.full_name || 'employee'}.`); await load(); } catch (e: any) { setError(e.message); } }}>Revoke</button>}</td></tr>; })}</tbody></table>{!shown.length && <p className="p-5 text-slate-600">No task access grants found.</p>}</div>
  </section>;
}
