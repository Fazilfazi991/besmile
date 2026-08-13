'use client';

import Link from 'next/link';
import { teamAttendanceState } from '@/lib/team-attendance-state';
import { employeeAvatarInitials, resolveEmployeeAvatar } from '@/lib/employee-avatar';

export type TeamMember = { id: string; full_name: string; designation?: string | null; department?: { name?: string | null } | null; photo_url?: string | null; attendance?: any; on_leave?: boolean };

export function TeamAttendanceStrip({ employees, loading = false, canOpenEmployees, standardHub = false }: { employees?: TeamMember[]; loading?: boolean; canOpenEmployees: boolean; standardHub?: boolean }) {
  if (loading) return <TeamAttendanceSkeleton />;
  if (!employees?.length) return <section className="team-today"><div className="team-today-heading"><div><h2>Team Today</h2><p>Live attendance overview</p></div></div><p className="team-today-empty">No active team members to display.</p></section>;
  const uniqueEmployees = [...new Map(employees.map((employee) => [employee.full_name.trim().toLocaleLowerCase() || employee.id, employee])).values()];
  const photoUseCount = new Map<string, number>();
  uniqueEmployees.forEach((employee) => { const photo = resolveEmployeeAvatar(employee.full_name, employee.photo_url); if (photo) photoUseCount.set(photo, (photoUseCount.get(photo) || 0) + 1); });
  return <section className={`team-today${standardHub ? ' standard-team-today' : ''}`} aria-labelledby="team-today-title"><div className="team-today-heading"><div><h2 id="team-today-title">Team Today</h2><p>Live attendance overview</p></div>{canOpenEmployees && <Link href="/admin/attendance" className="team-today-link">View attendance</Link>}</div><div className="team-today-scroll" aria-label="Active employee attendance"><div className="team-today-list">{uniqueEmployees.map((employee, index) => <TeamAttendanceCard employee={employee} canOpenEmployees={canOpenEmployees} duplicatePhoto={photoUseCount.get(employee.photo_url || '')! > 1} standardHub={standardHub} accent={index % 5} key={employee.id} />)}</div></div></section>;
}

function TeamAttendanceCard({ employee, canOpenEmployees, duplicatePhoto, standardHub, accent }: { employee: TeamMember; canOpenEmployees: boolean; duplicatePhoto: boolean; standardHub: boolean; accent: number }) {
  const state = teamAttendanceState(employee.attendance, employee.on_leave); const photo = resolveEmployeeAvatar(employee.full_name, employee.photo_url); const designation = !employee.designation || /^(staff|employee)$/i.test(employee.designation.trim()) ? employee.department?.name || 'Designation not set' : employee.designation;
  const content = standardHub ? <><div className="team-member-hub-heading"><Avatar name={employee.full_name} src={duplicatePhoto ? undefined : photo} /><span>●</span><small title={designation}>{designation}</small></div><div className="team-member-copy"><b title={employee.full_name}>{employee.full_name}</b><span>Today&apos;s focus...</span></div><span className="team-focus-control">On track</span></> : <><Avatar name={employee.full_name} src={duplicatePhoto ? undefined : photo} /><div className="team-member-copy"><b title={employee.full_name}>{employee.full_name}</b><span title={designation}>{designation}</span></div><div className={`team-member-status ${state.tone}`}><span aria-hidden="true" /><div><strong>{state.label}</strong>{state.detail && <small>{state.detail}</small>}</div></div></>;
  return canOpenEmployees ? <Link href={`/admin/employees/${employee.id}`} className={`team-member-card${standardHub ? ` standard-team-card accent-${accent}` : ''}`}>{content}</Link> : <article className="team-member-card">{content}</article>;
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  const initials = employeeAvatarInitials(name);
  return <div className="team-member-avatar">{src && <img src={src} alt={`${name} profile photo`} onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.removeAttribute('hidden'); }} />}<span hidden={!!src} aria-label={`${name} initials`}>{initials}</span></div>;
}

function TeamAttendanceSkeleton() { return <section className="team-today" aria-label="Loading team attendance"><div className="team-today-heading"><div><h2>Team Today</h2><p>Live attendance overview</p></div></div><div className="team-today-scroll"><div className="team-today-list">{Array.from({ length: 5 }).map((_, index) => <div className="team-member-card team-member-skeleton" key={index}><span className="team-member-avatar" /><div><i /><i /></div><i /></div>)}</div></div></section>; }
