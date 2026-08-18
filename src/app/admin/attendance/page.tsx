'use client';

import { useEffect, useMemo, useState } from 'react';
import { employeeRepository } from '@/lib/employee-repository';
import { attendanceDuration, dateKey } from '@/lib/attendance-rules';
import { formatDistance } from '@/lib/attendance-geofence';

type StaffAttendance = { id: string; full_name: string; employee_code?: string | null; designation?: string | null; department?: { name?: string | null } | null; on_leave: boolean; attendance: any };

const today = () => dateKey(new Date(), 'Asia/Kolkata');
const label = (row: StaffAttendance) => row.on_leave ? 'On Leave' : !row.attendance ? 'Absent' : String(row.attendance.status || 'present').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const time = (value?: string | null) => value ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';
const duration = (row: any, workDate: string) => { const result = attendanceDuration(row, { timeZone: 'Asia/Kolkata', workDate }); return result.minutes === null ? '—' : `${Math.floor(result.minutes / 60)}h ${result.minutes % 60}m`; };
const incomplete = (row: any, workDate: string) => attendanceDuration(row, { timeZone: 'Asia/Kolkata', workDate }).isIncomplete;
const location = (verified?: boolean | null, distance?: number | null) => verified === true ? `Verified${typeof distance === 'number' ? ` · ${formatDistance(distance)}` : ''}` : 'Not verified';

export default function StaffAttendancePage() {
  const [workDate, setWorkDate] = useState(today);
  const [rows, setRows] = useState<StaffAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employee, setEmployee] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [, setClockTick] = useState(0);
  useEffect(() => { let live = true; const timer = window.setTimeout(() => { void employeeRepository.companyAttendance(workDate).then(data => { if (live) setRows(data); }).catch(caught => { if (live) setError(caught.message || 'Attendance could not be loaded.'); }).finally(() => { if (live) setLoading(false); }); }, 0); return () => { live = false; window.clearTimeout(timer); }; }, [workDate]);
  useEffect(() => { const timer = window.setInterval(() => setClockTick(value => value + 1), 60_000); return () => window.clearInterval(timer); }, []);
  const departments = useMemo(() => [...new Set(rows.map(row => row.department?.name).filter(Boolean))] as string[], [rows]);
  const statuses = useMemo(() => [...new Set(rows.map(label))], [rows]);
  const visibleRows = useMemo(() => rows.filter(row => (!employee || row.id === employee) && (!department || row.department?.name === department) && (!status || label(row) === status)), [rows, employee, department, status]);
  const counts = useMemo(() => ({ present: rows.filter(row => label(row) === 'Present').length, absent: rows.filter(row => label(row) === 'Absent').length, leave: rows.filter(row => label(row) === 'On Leave').length }), [rows]);
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold">Staff Attendance</h1><p className="text-slate-600">Company attendance for the selected business date.</p></div>
    <div className="grid gap-3 sm:grid-cols-3"><Summary label="Present" value={counts.present} /><Summary label="Absent" value={counts.absent} /><Summary label="On leave" value={counts.leave} /></div>
    <div className="card grid gap-3 p-4 md:grid-cols-4"><label>Date<input className="mt-1 w-full rounded border p-2" type="date" value={workDate} onChange={event => { setLoading(true); setError(''); setWorkDate(event.target.value); }} /></label><label>Employee<select className="mt-1 w-full rounded border p-2" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">All employees</option>{rows.map(row => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label><label>Department<select className="mt-1 w-full rounded border p-2" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map(item => <option key={item}>{item}</option>)}</select></label><label>Status<select className="mt-1 w-full rounded border p-2" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(item => <option key={item}>{item}</option>)}</select></label></div>
    {error && <p className="text-rose-700">{error}</p>}
    <div className="card overflow-x-auto"><table className="table min-w-[1050px]"><thead><tr><th>Employee</th><th>Department</th><th>Date</th><th>Clock in</th><th>Clock out</th><th>Working</th><th>Break</th><th>Status</th><th>Location audit</th></tr></thead><tbody>{loading ? <tr><td className="p-5 text-slate-500" colSpan={9}>Loading attendance…</td></tr> : visibleRows.map(row => <tr key={row.id}><td><b>{row.full_name}</b><small className="block">{[row.employee_code, row.designation].filter(Boolean).join(' · ') || '—'}</small></td><td>{row.department?.name || '—'}</td><td>{workDate}</td><td>{time(row.attendance?.clock_in)}</td><td>{time(row.attendance?.clock_out)}</td><td>{duration(row.attendance, workDate)}{incomplete(row.attendance, workDate) && <small className="block text-amber-800">Missing clock-out</small>}</td><td>{row.attendance?.break_minutes ? `${row.attendance.break_minutes} min` : '—'}</td><td>{label(row)}</td><td><small>In: {location(row.attendance?.clock_in_location_verified, row.attendance?.clock_in_distance_metres)}<br />Out: {location(row.attendance?.clock_out_location_verified, row.attendance?.clock_out_distance_metres)}</small></td></tr>)}{!loading && !visibleRows.length && <tr><td className="p-5 text-slate-500" colSpan={9}>No employees match these filters.</td></tr>}</tbody></table></div>
  </section>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="card p-4"><p className="text-sm text-slate-600">{label}</p><b className="text-2xl">{value}</b></div>; }
