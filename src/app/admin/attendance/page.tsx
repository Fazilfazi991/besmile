'use client';

import { useEffect, useMemo, useState } from 'react';
import { employeeRepository } from '@/lib/employee-repository';
import { attendanceException, attendanceDuration, dateKey } from '@/lib/attendance-rules';
import { formatDistance } from '@/lib/attendance-geofence';
import { attendanceExportFilename, attendanceExportRows } from '@/lib/attendance-export';
import Link from 'next/link';

type StaffAttendance = { id: string; full_name: string; employee_code?: string | null; designation?: string | null; department?: { name?: string | null } | null; on_leave: boolean; attendance: any };

const today = () => dateKey(new Date(), 'Asia/Kolkata');
const label = (row: StaffAttendance) => row.on_leave ? 'On Leave' : !row.attendance ? 'Absent' : String(row.attendance.status || 'present').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const time = (value?: string | null, timeZone = 'Asia/Kolkata') => value ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(new Date(value)) : '—';
const duration = (row: any, settings: any, workDate: string) => { const result = attendanceDuration(row, { timeZone: settings?.timezone, workDate }); return result.minutes === null ? (result.isIncomplete ? 'Punch out required' : '—') : `${Math.floor(result.minutes / 60)}h ${String(result.minutes % 60).padStart(2, '0')}m`; };
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
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState<any>();
  const [regularizations, setRegularizations] = useState<any[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  useEffect(() => { let live = true; const timer = window.setTimeout(() => { void Promise.all([employeeRepository.companyAttendance(workDate), employeeRepository.attendanceSettings(), employeeRepository.attendanceRegularizations(workDate)]).then(([data, attendanceSettings, requests]) => { if (live) { setRows(data); setSettings(attendanceSettings); setRegularizations(requests); } }).catch(caught => { if (live) setError(caught.message || 'Attendance could not be loaded.'); }).finally(() => { if (live) setLoading(false); }); }, 0); return () => { live = false; window.clearTimeout(timer); }; }, [workDate]);
  const departments = useMemo(() => [...new Set(rows.map(row => row.department?.name).filter(Boolean))] as string[], [rows]);
  const statuses = useMemo(() => [...new Set(rows.map(label))], [rows]);
  const visibleRows = useMemo(() => rows.filter(row => (!employee || row.id === employee) && (!department || row.department?.name === department) && (!status || label(row) === status)), [rows, employee, department, status]);
  const counts = useMemo(() => ({ present: rows.filter(row => label(row) === 'Present').length, absent: rows.filter(row => label(row) === 'Absent').length, leave: rows.filter(row => label(row) === 'On Leave').length }), [rows]);
  const exportExcel = async () => { setExporting(true); setError(''); try { const XLSX = await import('xlsx'); const sheet = XLSX.utils.json_to_sheet(attendanceExportRows(visibleRows, workDate, label, settings?.timezone)); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Attendance'); XLSX.writeFile(book, attendanceExportFilename(workDate)); } catch (caught: any) { setError(caught.message || 'Attendance export could not be created.'); } finally { setExporting(false); } };
  const review = async (id: string, decision: 'approved' | 'rejected') => { setReviewing(id); setError(''); try { await employeeRepository.reviewAttendanceRegularization(id, decision); const [data, requests] = await Promise.all([employeeRepository.companyAttendance(workDate), employeeRepository.attendanceRegularizations(workDate)]); setRows(data); setRegularizations(requests); } catch (caught: any) { setError(caught.message || 'Regularization could not be reviewed.'); } finally { setReviewing(null); } };
  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Staff Attendance</h1><p className="text-slate-600">Company attendance for the selected business date.</p></div><div className="flex flex-wrap gap-2"><Link className="btn border min-h-11" href="/admin/daily-work">Daily work updates</Link><button type="button" className="btn border min-h-11" disabled={loading || exporting} onClick={() => void exportExcel()}>{exporting ? 'Exporting…' : 'Export Excel'}</button></div></div>
    <div className="grid gap-3 sm:grid-cols-3"><Summary label="Present" value={counts.present} /><Summary label="Absent" value={counts.absent} /><Summary label="On leave" value={counts.leave} /></div>
    <div className="card grid gap-3 p-4 md:grid-cols-4"><label>Date<input className="mt-1 w-full rounded border p-2" type="date" value={workDate} onChange={event => { setLoading(true); setError(''); setWorkDate(event.target.value); }} /></label><label>Employee<select className="mt-1 w-full rounded border p-2" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">All employees</option>{rows.map(row => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label><label>Department<select className="mt-1 w-full rounded border p-2" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map(item => <option key={item}>{item}</option>)}</select></label><label>Status<select className="mt-1 w-full rounded border p-2" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(item => <option key={item}>{item}</option>)}</select></label></div>
    {error && <p className="text-rose-700">{error}</p>}
    <div className="card overflow-x-auto"><table className="table min-w-[760px]"><thead><tr><th>Employee</th><th>Punch in</th><th>Punch out</th><th>Total working hours</th><th>Status</th><th>Location audit</th></tr></thead><tbody>{loading ? <tr><td className="p-5 text-slate-500" colSpan={6}>Loading attendance…</td></tr> : visibleRows.map(row => { const exception = settings ? attendanceException(row.attendance, settings, { workDate }) : null; const pending = regularizations.find(item => item.attendance_id === row.attendance?.id && item.status === 'pending'); return <tr className={exception ? 'bg-rose-50 text-rose-900' : ''} key={row.id}><td><b>{row.full_name}</b><small className="block">{[row.employee_code, row.designation].filter(Boolean).join(' · ') || '—'}</small></td><td>{time(row.attendance?.clock_in, settings?.timezone)}</td><td>{time(row.attendance?.clock_out, settings?.timezone)}</td><td>{duration(row.attendance, settings, workDate)}</td><td><b>{exception === 'missing_punch' ? 'Half Day · Missed Punch' : exception === 'under_hours' ? 'Under Required Hours' : label(row)}</b>{pending ? <small className="block text-amber-700">Regularization pending</small> : null}</td><td><small>In: {location(row.attendance?.clock_in_location_verified, row.attendance?.clock_in_distance_metres)}<br />Out: {location(row.attendance?.clock_out_location_verified, row.attendance?.clock_out_distance_metres)}</small></td></tr>; })}{!loading && !visibleRows.length && <tr><td className="p-5 text-slate-500" colSpan={6}>No employees match these filters.</td></tr>}</tbody></table></div>
    {regularizations.filter(item => item.status === 'pending').length ? <section className="card p-4"><h2 className="font-bold">Regularization requests</h2><div className="mt-3 space-y-3">{regularizations.filter(item => item.status === 'pending').map(item => <article className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-3" key={item.id}><div><b>{item.profile?.full_name || 'Employee'}</b><p className="text-sm text-slate-700">{item.reason}</p><small>Original attendance remains unchanged until review.</small></div><div className="flex gap-2"><button className="btn border" disabled={reviewing === item.id} onClick={() => void review(item.id, 'rejected')}>Reject</button><button className="btn btn-primary" disabled={reviewing === item.id} onClick={() => void review(item.id, 'approved')}>{reviewing === item.id ? 'Saving…' : 'Approve'}</button></div></article>)}</div></section> : null}
  </section>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="card p-4"><p className="text-sm text-slate-600">{label}</p><b className="text-2xl">{value}</b></div>; }
