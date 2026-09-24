'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildOrganizationTree, isChairman, reportingManagerError, type OrganizationEmployee, type OrganizationNode } from '@/lib/organization-chart-config';
import { ancestorIds, initialCollapsedBranches, layoutOrganization, organizationCardHeight, organizationCardWidth } from '@/lib/organization-chart-layout';
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
type PersonData = {
  person: OrganizationEmployee;
  directReports: number;
  hasParent: boolean;
  unassigned: boolean;
  collapsed: boolean;
  current: boolean;
  isSelf: boolean;
  detailHref: string | null;
  onToggle: (id: string) => void;
  onEdit: (person: OrganizationEmployee) => void;
};
type PersonNode = Node<PersonData, 'person'>;

function managerNote(person: OrganizationEmployee, hasParent: boolean, unassigned: boolean, directReports: number) {
  if (unassigned) return 'Reporting manager unavailable';
  if (!hasParent && !isChairman(person.designation)) return 'No reporting manager set';
  return `${directReports} direct ${directReports === 1 ? 'report' : 'reports'}`;
}

function PersonCard({ data }: NodeProps<PersonNode>) {
  const { person, directReports, hasParent, unassigned, collapsed, current, isSelf, detailHref, onToggle, onEdit } = data;
  return <article className={`organization-person-card${current ? ' is-current' : ''}`} data-employee-id={person.id} aria-label={`${person.full_name}, ${person.designation || 'Position not assigned'}`} title={`${person.full_name} — ${person.designation || 'Position not assigned'}`}>
    {hasParent && <Handle type="target" position={Position.Top} isConnectable={false} className="organization-flow-handle" />}
    <div className="organization-person-main">
      <div className="organization-person-avatar"><Avatar key={person.photo_url || 'initials'} person={person} /></div>
      <div className="organization-person-identity">
        <div className="organization-person-name">{detailHref ? <Link className="nodrag nopan" href={detailHref} title={`Open details for ${person.full_name}`}>{person.full_name}</Link> : <strong>{person.full_name}</strong>}{current && isSelf && <span className="organization-person-you">You</span>}</div>
        <span title={person.designation || 'Position not assigned'}>{person.designation || 'Position not assigned'}</span>
        <small title={person.department_name || 'No department'}>{person.department_name || 'No department'}</small>
      </div>
    </div>
    <div className="organization-person-footer">
      <span className={unassigned || (!hasParent && !isChairman(person.designation)) ? 'organization-person-warning' : ''} title={managerNote(person, hasParent, unassigned, directReports)}>{managerNote(person, hasParent, unassigned, directReports)}</span>
      {directReports > 0 && <button type="button" className="nodrag nopan organization-person-action" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${directReports} direct reports for ${person.full_name}`} aria-expanded={!collapsed} onClick={() => onToggle(person.id)}>{collapsed ? `+${directReports}` : '−'}</button>}
      {person.can_edit && <button type="button" className="nodrag nopan organization-person-action" data-org-edit-id={person.id} aria-label={`Edit organization details for ${person.full_name}`} onClick={() => onEdit(person)}>Edit</button>}
    </div>
    {directReports > 0 && !collapsed && <Handle type="source" position={Position.Bottom} isConnectable={false} className="organization-flow-handle" />}
  </article>;
}
const nodeTypes = { person: PersonCard };

function OrganizationListBranch({ node, collapsed, currentId, isSelf, adminView, onToggle, onEdit }: { node: OrganizationNode; collapsed: Set<string>; currentId: string; isSelf: boolean; adminView: boolean; onToggle: (id: string) => void; onEdit: (person: OrganizationEmployee) => void }) {
  const isCollapsed = collapsed.has(node.id);
  const detailHref = adminView ? `/admin/employees/${node.id}` : node.id === currentId ? '/employee/profile' : null;
  return <li className="organization-list-item">
    <div className="organization-list-person" data-employee-id={node.id}>
      <div className="organization-person-avatar"><Avatar key={node.photo_url || 'initials'} person={node} /></div>
      <div className="organization-list-identity"><strong>{detailHref ? <Link href={detailHref}>{node.full_name}</Link> : node.full_name}</strong>{node.id === currentId && isSelf && <span className="organization-person-you">You</span>}<span>{node.designation || 'Position not assigned'} · {node.department_name || 'No department'}</span><small>{managerNote(node, Boolean(node.manager_id && !node.unassigned), node.unassigned, node.children.length)}</small></div>
      <div className="organization-list-actions">{node.can_edit && <button type="button" className="btn border" data-org-edit-id={node.id} aria-label={`Edit organization details for ${node.full_name}`} onClick={() => onEdit(node)}>Edit</button>}{node.children.length > 0 && <button type="button" className="btn border" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.children.length} direct reports for ${node.full_name}`} aria-expanded={!isCollapsed} onClick={() => onToggle(node.id)}>{isCollapsed ? `Show ${node.children.length}` : 'Hide'}</button>}</div>
    </div>
    {node.children.length > 0 && !isCollapsed && <ul>{node.children.map(child => <OrganizationListBranch key={child.id} node={child} collapsed={collapsed} currentId={currentId} isSelf={isSelf} adminView={adminView} onToggle={onToggle} onEdit={onEdit} />)}</ul>}
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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<'chart' | 'list' | null>(null);
  const [expanded, setExpanded] = useState(false);
  const adminView = usePathname().startsWith('/admin/');
  const [flow, setFlow] = useState<ReactFlowInstance<PersonNode, Edge> | null>(null);
  const [pendingFind, setPendingFind] = useState(false);
  const titleId = useId();
  const request = useRef(0);
  const initializedBranches = useRef(false);
  const manualViewChoice = useRef(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const invalidate = useCallback(() => { request.current += 1; }, []);
  const load = useCallback(async () => {
    const revision = ++request.current;
    try {
      const rows = await organizationRepository.directory();
      if (request.current === revision) {
        if (!initializedBranches.current) { setCollapsed(initialCollapsedBranches(rows)); initializedBranches.current = true; }
        setPeople(rows); setError('');
      }
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
  const structureKey = JSON.stringify(people.map(({ id, full_name, designation, manager_id, status }) => ({ id, full_name, designation, manager_id, status, department_id: null, department_name: null, avatar_url: null, can_edit: false })));
  const structuralPeople = useMemo(() => JSON.parse(structureKey) as OrganizationEmployee[], [structureKey]);
  const layout = useMemo(() => layoutOrganization(structuralPeople, collapsed), [structuralPeople, collapsed]);
  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);
  const toggle = useCallback((id: string) => setCollapsed(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  const detailHref = useCallback((id: string) => adminView ? `/admin/employees/${id}` : id === profileId ? '/employee/profile' : null, [adminView, profileId]);
  const nodes = useMemo<PersonNode[]>(() => layout.nodes.map(item => ({
    id: item.id,
    type: 'person',
    position: { x: item.x, y: item.y },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    draggable: false,
    selectable: false,
    style: { width: organizationCardWidth, height: organizationCardHeight },
    data: { person: peopleById.get(item.id)!, directReports: item.directReports, hasParent: item.hasParent, unassigned: item.unassigned, collapsed: collapsed.has(item.id), current: item.id === profileId, isSelf, detailHref: detailHref(item.id), onToggle: toggle, onEdit: setEditing },
  })), [layout, peopleById, collapsed, profileId, isSelf, detailHref, toggle]);
  const edges = useMemo<Edge[]>(() => layout.edges.map(({ source, target }) => ({ id: `${source}->${target}`, source, target, type: 'smoothstep', selectable: false, style: { strokeWidth: 2 } })), [layout]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const choose = () => { if (!manualViewChoice.current) setViewMode(media.matches ? 'list' : 'chart'); };
    const initial = window.setTimeout(choose, 0);
    media.addEventListener('change', choose);
    return () => { window.clearTimeout(initial); media.removeEventListener('change', choose); };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setExpanded(false); expandButton.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);
  useEffect(() => {
    if (!pendingFind || !flow) return;
    const me = layout.nodes.find(node => node.id === profileId);
    if (!me) return;
    const frame = window.requestAnimationFrame(() => {
      void flow.setCenter(me.x + organizationCardWidth / 2, me.y + organizationCardHeight / 2, { zoom: 1, duration: 250 });
      setPendingFind(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingFind, flow, layout, profileId]);
  const fit = () => { if (flow) void flow.fitView({ padding: 0.15, minZoom: 0.4, maxZoom: 1.05, duration: 250 }); };
  const findMe = () => {
    if (!peopleById.has(profileId)) { setNotice('Your profile is not in the active organization chart.'); return; }
    const ancestors = ancestorIds(people, profileId);
    setCollapsed(current => { const next = new Set(current); ancestors.forEach(id => next.delete(id)); return next; });
    setViewMode('chart'); setPendingFind(true);
  };
  const close = () => {
    const id = editing?.id;
    setEditing(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-employee-id="${id}"] button`)?.focus());
  };
  return <section className={`organization-chart-section${expanded ? ' is-expanded' : ''}`} aria-labelledby={titleId} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined}>
    <header className="organization-chart-header"><div><h2 id={titleId}>Organization chart</h2><p>Real reporting lines. Pan to explore, or switch to the hierarchy list.</p></div><div className="organization-chart-actions">
      <div className="organization-chart-view-switch" role="group" aria-label="Organization view"><button type="button" aria-pressed={viewMode === 'chart'} onClick={() => { manualViewChoice.current = true; setViewMode('chart'); }}>Chart</button><button type="button" aria-pressed={viewMode === 'list'} onClick={() => { manualViewChoice.current = true; setViewMode('list'); setExpanded(false); }}>List</button></div>
      {viewMode === 'chart' && <><button type="button" className="btn border" onClick={fit}>Fit chart</button><button type="button" className="btn border" aria-label="Zoom in" onClick={() => { if (flow) void flow.zoomIn({ duration: 200 }); }}>+</button><button type="button" className="btn border" aria-label="Zoom out" onClick={() => { if (flow) void flow.zoomOut({ duration: 200 }); }}>−</button><button type="button" className="btn border" onClick={findMe}>Find me</button><button ref={expandButton} type="button" className="btn border" aria-pressed={expanded} onClick={() => { setExpanded(value => !value); window.requestAnimationFrame(() => fit()); }}>{expanded ? 'Close expanded view' : 'Expand chart'}</button></>}
      <button type="button" className="btn border" onClick={() => void load()}>Refresh chart</button>
    </div></header>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading organization…</p> : !people.length && !error ? <p>No active employees are available.</p> : viewMode === 'list' ? <div className="organization-list-view" role="region" aria-label="Organization hierarchy list"><ul>{roots.map(root => <OrganizationListBranch key={root.id} node={root} collapsed={collapsed} currentId={profileId} isSelf={isSelf} adminView={adminView} onToggle={toggle} onEdit={setEditing} />)}</ul></div> : viewMode === 'chart' ? <div className="organization-flow-canvas" role="region" aria-label="Pannable organization chart">
      <ReactFlow<PersonNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setFlow} fitView fitViewOptions={{ padding: 0.15, minZoom: 0.4, maxZoom: 1.05 }} minZoom={0.35} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} elementsSelectable={false} deleteKeyCode={null} selectionKeyCode={null} zoomOnScroll={false} zoomOnDoubleClick={false} panOnScroll={false} preventScrolling={false} panOnDrag>
        <div className="organization-flow-hint">Drag empty space to pan · Use controls to zoom</div>
      </ReactFlow>
    </div> : null}
    {editing && <OrganizationEditor person={editing} people={people} onClose={close} onSaved={() => { close(); setNotice('Organization details saved.'); void load(); onChanged?.(); }} />}
  </section>;
}
