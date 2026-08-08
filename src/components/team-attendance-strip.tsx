'use client';

import Link from 'next/link';
import { teamAttendanceState } from '@/lib/team-attendance-state';

export type TeamMember = { id: string; full_name: string; designation?: string | null; photo_url?: string | null; attendance?: any; on_leave?: boolean };
const demoPhotos: Record<string, string> = { fayiz: '/demo/employees/fayiz.jpg', 'diya anthikat': '/demo/employees/diya-anthikat.jpg', 'aiswarya p': '/demo/employees/aiswarya-p.jpg', 'anushma vk': '/demo/employees/anushma-vk.jpg' };

export function TeamAttendanceStrip({ employees, loading = false, canOpenEmployees }: { employees?: TeamMember[]; loading?: boolean; canOpenEmployees: boolean }) {
  if (loading) return <TeamAttendanceSkeleton />;
  if (!employees?.length) return <section className="team-today"><div className="team-today-heading"><div><h2>Team Today</h2><p>Live attendance overview</p></div></div><p className="team-today-empty">No active team members to display.</p></section>;
  return <section className="team-today" aria-labelledby="team-today-title"><div className="team-today-heading"><div><h2 id="team-today-title">Team Today</h2><p>Live attendance overview</p></div>{canOpenEmployees && <Link href="/admin/employees" className="team-today-link">View all</Link>}</div><div className="team-today-scroll" aria-label="Active employee attendance"><div className="team-today-list">{employees.map((employee) => <TeamAttendanceCard employee={employee} canOpenEmployees={canOpenEmployees} key={employee.id} />)}</div></div></section>;
}

function TeamAttendanceCard({ employee, canOpenEmployees }: { employee: TeamMember; canOpenEmployees: boolean }) {
  const state = teamAttendanceState(employee.attendance, employee.on_leave); const photo = employee.photo_url || demoPhotos[employee.full_name.trim().toLowerCase()];
  const content = <><Avatar name={employee.full_name} src={photo} /><div className="team-member-copy"><b title={employee.full_name}>{employee.full_name}</b><span title={employee.designation || 'Employee'}>{employee.designation || 'Employee'}</span></div><div className={`team-member-status ${state.tone}`}><span aria-hidden="true" /><div><strong>{state.label}</strong>{state.detail && <small>{state.detail}</small>}</div></div></>;
  return canOpenEmployees ? <Link href={`/admin/employees/${employee.id}`} className="team-member-card">{content}</Link> : <article className="team-member-card">{content}</article>;
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B';
  return <div className="team-member-avatar">{src && <img src={src} alt={`${name} profile photo`} onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.removeAttribute('hidden'); }} />}<span hidden={!!src} aria-label={`${name} initials`}>{initials}</span></div>;
}

function TeamAttendanceSkeleton() { return <section className="team-today" aria-label="Loading team attendance"><div className="team-today-heading"><div><h2>Team Today</h2><p>Live attendance overview</p></div></div><div className="team-today-scroll"><div className="team-today-list">{Array.from({ length: 5 }).map((_, index) => <div className="team-member-card team-member-skeleton" key={index}><span className="team-member-avatar" /><div><i /><i /></div><i /></div>)}</div></div></section>; }
