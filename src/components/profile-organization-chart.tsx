'use client';

import Image from 'next/image';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { buildOrganizationTree, isChairman, reportingManagerError, type OrganizationEmployee, type OrganizationNode } from '@/lib/organization-chart-config';
import { organizationChangedEvent, organizationRepository } from '@/lib/organization-repository';
import { employeeAvatarInitials } from '@/lib/employee-avatar';
import { DepartmentSelect } from './department-select';
import './profile-organization-chart.css';

function Avatar({ person }: { person: OrganizationEmployee }) {
  const [failed, setFailed] = useState(false);
  return person.photo_url && !failed
    ? <Image src={person.photo_url} alt="" width={48} height={48} unoptimized onError={() => setFailed(true)} />
    : <span>{employeeAvatarInitials(person.full_name)}</span>;
}
function OrganizationBranch({ node, profileId, isSelf, onEdit }: { node: OrganizationNode; profileId: string; isSelf: boolean; onEdit: (person: OrganizationEmployee) => void }) {
  const highlighted = node.id === profileId;
  return <li className="organization-chart-node" data-employee-id={node.id}>
    <article className={`organization-chart-card${highlighted ? ' is-current' : ''}`} aria-label={`${node.full_name}, ${node.designation || 'Position not assigned'}`}>
      {highlighted && isSelf && <span className="organization-chart-you">You</span>}
      <div className="organization-chart-avatar"><Avatar key={node.photo_url || 'initials'} person={node} /></div>
      <div className="organization-chart-identity"><strong>{node.full_name}</strong><span>{node.designation || 'Position not assigned'}</span><small>{node.department_name || 'No department'}</small></div>
      {node.unassigned && <small>Reporting manager unavailable</small>}
      {node.can_edit && <button type="button" className="organization-chart-edit" aria-label={`Edit organization details for ${node.full_name}`} onClick={() => onEdit(node)}>Edit organization</button>}
    </article>
    {!!node.children.length && <ul>{node.children.map(child => <OrganizationBranch key={child.id} node={child} profileId={profileId} isSelf={isSelf} onEdit={onEdit} />)}</ul>}
  </li>;
}
function OrganizationEditor({ person, people, onClose, onSaved }: { person: OrganizationEmployee; people: OrganizationEmployee[]; onClose: () => void; onSaved: () => void }) {
  const [manager, setManager] = useState(person.manager_id || '');
  const [designation, setDesignation] = useState(person.designation || '');
  const [departments, setDepartments] = useState<Array<{id: string; name: string}>>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    organizationRepository.departments().then(rows => { if (!cancelled) { setDepartments(rows); setReady(true); } }).catch(() => { if (!cancelled) setError('Departments could not be loaded. Close and try again.'); });
    return () => { cancelled = true; };
  }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const managerId = isChairman(designation) ? null : manager || null;
    const message = reportingManagerError(people, person.id, managerId, designation);
    if (message) { setError(message); return; }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await organizationRepository.update(person.id, { manager_id: managerId, department_id: String(form.get('department_id') || '') || null, designation });
      onSaved();
    } catch (caught) { setError((caught as {message?: string})?.message || 'Organization details could not be saved.'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="organization-editor" aria-labelledby="organization-edit-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={save} className="space-y-4">
      <h3 id="organization-edit-title" className="text-xl font-bold">Edit organization details</h3>
      <p>{person.full_name}</p>
      <label className="block">Position / designation<input className="input mt-1" value={designation} onChange={event => setDesignation(event.target.value)} required maxLength={150} disabled={busy} /></label>
      <div><span className="mb-1 block">Department</span>{ready && <DepartmentSelect departments={departments} value={person.department_id || ''} disabled={busy} />}</div>
      <label className="block">Reporting manager<select className="input mt-1" value={isChairman(designation) ? '' : manager} disabled={busy || isChairman(designation)} onChange={event => setManager(event.target.value)}>
        <option value="">No reporting manager (top level)</option>
        {people.filter(candidate => candidate.id !== person.id && !reportingManagerError(people, person.id, candidate.id, designation)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.full_name} — {candidate.designation || 'Position not assigned'}</option>)}
      </select></label>
      {isChairman(designation) && <p className="text-sm">The Chairman stays at the top of the organization.</p>}
      {error && <p role="alert" className="text-rose-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn border" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !ready}>{busy ? 'Saving…' : 'Save organization details'}</button></div>
    </form>
  </dialog>;
}

export function ProfileOrganizationChart({ profileId, refreshKey, isSelf = false, onChanged }: { profileId: string; refreshKey?: string; isSelf?: boolean; onChanged?: () => void }) {
  const [people, setPeople] = useState<OrganizationEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<OrganizationEmployee | null>(null);
  const [notice, setNotice] = useState('');
  const titleId = useId();
  const request = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const invalidate = useCallback(() => { request.current += 1; }, []);
  const load = useCallback(async () => {
    const revision = ++request.current;
    try {
      const rows = await organizationRepository.directory();
      if (request.current === revision) { setPeople(rows); setError(''); }
    } catch { if (request.current === revision) setError('Organization chart could not be refreshed. Try again.'); }
    finally { if (request.current === revision) setLoading(false); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => { if (!document.hidden) void load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener(organizationChangedEvent, refresh);
    document.addEventListener('visibilitychange', refresh);
    // Refresh before the private photo URLs expire, and pick up edits from other sessions.
    const timer = window.setInterval(refresh, 60_000);
    return () => { invalidate(); window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(organizationChangedEvent, refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load, refreshKey, invalidate]);
  const roots = useMemo(() => buildOrganizationTree(people), [people]);
  const hasPeople = people.length > 0;
  useEffect(() => {
    const element = viewport.current;
    if (!hasPeople || !element) return;
    const centerRoot = () => {
      const card = element.querySelector<HTMLElement>('.organization-chart-card');
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      element.scrollLeft += bounds.left + bounds.width / 2 - element.getBoundingClientRect().left - element.clientWidth / 2;
    };
    const observer = new ResizeObserver(centerRoot);
    observer.observe(element);
    centerRoot();
    return () => observer.disconnect();
  }, [hasPeople]);
  const close = () => {
    const id = editing?.id;
    setEditing(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-employee-id="${id}"] button`)?.focus());
  };
  return <section className="organization-chart-section" aria-labelledby={titleId}>
    <header><div><h2 id={titleId}>Organization chart</h2><p>Reporting structure at BSmile. Scroll across to explore the organization.</p></div><button type="button" className="btn border" onClick={() => void load()}>Refresh chart</button></header>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading organization…</p> : !people.length && !error ? <p>No active employees are available.</p> : <div ref={viewport} className="organization-chart-viewport" tabIndex={0} role="region" aria-label="Scrollable organization chart">
      <ul className="organization-chart-tree" aria-label="BSmile organization hierarchy">{roots.map(root => <OrganizationBranch key={root.id} node={root} profileId={profileId} isSelf={isSelf} onEdit={setEditing} />)}</ul>
    </div>}
    {editing && <OrganizationEditor person={editing} people={people} onClose={close} onSaved={() => { close(); setNotice('Organization details saved.'); void load(); onChanged?.(); }} />}
  </section>;
}
