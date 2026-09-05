'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { canClockIn, classify, dateKey, minutes } from '@/lib/attendance-rules';
import { freshLocation, locationCheckingMessage } from '@/lib/attendance-geofence';
import { CompactEmptyState, Pagination, StatusBadge } from '@/components/compact-module';
import './attendance-workspace.css';

type Period = 'last-7' | 'month' | 'custom';
type AttendanceDay = { key: string; row: any; status: string };

const PAGE_SIZES = [10, 20, 50];
const labels: Record<string, string> = { all: 'All', present: 'Present', late: 'Late', absent: 'Absent', leave: 'Leave', holiday: 'Holiday', weekend: 'Weekly Off' };
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const rangeFor = (period: Period, customFrom: string, customTo: string) => {
  const today = new Date();
  if (period === 'last-7') return { from: iso(addDays(today, -6)), to: iso(today) };
  if (period === 'custom') return { from: customFrom, to: customTo };
  return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
};
const time = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
const durationLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parseDate(value));
const shiftLabel = (status: string, settings: any) => status === 'weekend' ? 'Weekly off' : status === 'holiday' ? 'Holiday' : status === 'leave' ? 'Approved leave' : `${String(settings.work_start).slice(0, 5)} – ${String(settings.work_end).slice(0, 5)}`;

function daysInRange(from: string, to: string, result: any): AttendanceDay[] {
  const holidays = new Set<string>((result.holidays || []).map((holiday: any) => holiday.holiday_date));
  const rows = new Map<string, any>((result.attendance || []).map((row: any) => [row.work_date, row]));
  const days: AttendanceDay[] = [];
  for (let cursor = parseDate(from); iso(cursor) <= to; cursor = addDays(cursor, 1)) {
    const key = iso(cursor);
    const row = rows.get(key);
    const onLeave = (result.leaves || []).some((leave: any) => leave.starts_on <= key && leave.ends_on >= key);
    const status = row?.status === 'late' ? 'late' : classify(cursor, row, result.settings, holidays, onLeave);
    if (status !== 'future') days.push({ key, row, status });
  }
  return days.sort((a, b) => b.key.localeCompare(a.key));
}

export default function AttendancePage() {
  const defaults = rangeFor('month', '', '');
  const [profile, setProfile] = useState<any>();
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState(defaults.from);
  const [customTo, setCustomTo] = useState(defaults.to);
  const [data, setData] = useState<any>();
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [todayEntry, setTodayEntry] = useState<AttendanceDay>();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState('');
  const attendanceRequest = useRef(false);
  const range = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo]);
  const invalidRange = Boolean(range.from && range.to && range.from > range.to);

  const load = useCallback(async () => {
    if (!range.from || !range.to || invalidRange) return;
    setLoading(true); setError('');
    try {
      const employee = await currentProfile() as any;
      if (!employee) throw Error('Your session has expired.');
      setProfile(employee);
      const todayResult = await employeeRepository.attendanceToday(employee.id);
      const [result, separateTodayRules] = await Promise.all([
        employeeRepository.attendanceRules(employee.id, range.from, range.to),
        todayResult.workDate >= range.from && todayResult.workDate <= range.to ? Promise.resolve(null) : employeeRepository.attendanceRules(employee.id, todayResult.workDate, todayResult.workDate),
      ]);
      setData(result);
      setDays(daysInRange(range.from, range.to, result));
      const todayRules = separateTodayRules || result;
      const todayDay = daysInRange(todayResult.workDate, todayResult.workDate, todayRules)[0];
      setTodayEntry(todayDay ? { ...todayDay, row: todayResult.attendance } : undefined);
    } catch (caught: any) { setError(caught.message || 'Unable to load attendance.'); }
    finally { setLoading(false); }
  }, [invalidRange, range.from, range.to]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setStatus('all'); }, [period, customFrom, customTo]);

  const today = data ? dateKey(new Date(), data.settings.timezone) : '';
  const activeBreak = todayEntry?.row?.attendance_breaks?.find((item: any) => !item.ended_at);
  const durationFor = (day: AttendanceDay) => ({ minutes: day.row?.clock_in ? minutes(day.row) : null });
  const attendanceAction = async (action: 'clockIn' | 'clockOut' | 'startBreak' | 'endBreak') => {
    if (!profile || attendanceRequest.current) return;
    attendanceRequest.current = true; setActing(true); setError(''); setNotice('');
    try {
      if (action === 'clockIn' || action === 'clockOut') setAttendanceStatus(locationCheckingMessage);
      if (action === 'clockIn') await employeeRepository.clockIn(profile.id, await freshLocation('Clock In'));
      if (action === 'clockOut' && todayEntry?.row) await employeeRepository.clockOut(todayEntry.row.id, await freshLocation('Clock Out'));
      if (action === 'startBreak' && todayEntry?.row) await employeeRepository.startBreak(todayEntry.row.id);
      if (action === 'endBreak' && activeBreak) await employeeRepository.endBreak(activeBreak.id);
      setNotice('Attendance updated.'); await load();
    } catch (caught: any) { setError(caught.message || 'Attendance could not be updated.'); }
    finally { attendanceRequest.current = false; setAttendanceStatus(''); setActing(false); }
  };

  const statuses = useMemo(() => ['all', ...['present', 'late', 'absent', 'leave', 'holiday', 'weekend'].filter(value => days.some(day => day.status === value))], [days]);
  const counts = useMemo(() => Object.fromEntries(statuses.map(value => [value, value === 'all' ? days.length : days.filter(day => day.status === value).length])), [days, statuses]);
  const filtered = status === 'all' ? days : days.filter(day => day.status === status);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const todayAction = !todayEntry?.row
    ? <button className="btn btn-primary" disabled={acting || !canClockIn(todayEntry?.status || 'future')} onClick={() => void attendanceAction('clockIn')}>Clock in</button>
    : todayEntry.row.clock_out ? null : activeBreak
      ? <button className="btn btn-primary" disabled={acting} onClick={() => void attendanceAction('endBreak')}>End break</button>
      : <><button className="btn" disabled={acting} onClick={() => void attendanceAction('startBreak')}>Start break</button><button className="btn btn-primary" disabled={acting} onClick={() => void attendanceAction('clockOut')}>Clock out</button></>;

  return <section className="attendance-workspace">
    <header className="attendance-heading">
      <div><h1>My Attendance</h1><p>Your personal attendance record and working time.</p></div>
      {todayAction ? <div className="attendance-today-actions" aria-label="Today’s attendance actions">{todayAction}</div> : null}
    </header>

    <div className="attendance-period" role="group" aria-label="Attendance period">
      {([['last-7', 'Last 7 Days'], ['month', 'This Month'], ['custom', 'Custom']] as const).map(([value, label]) => <button type="button" className={period === value ? 'active' : ''} aria-pressed={period === value} onClick={() => setPeriod(value)} key={value}>{label}</button>)}
      {period === 'custom' ? <div className="attendance-date-range">
        <label>From<input type="date" value={customFrom} max={customTo} onChange={event => setCustomFrom(event.target.value)} /></label>
        <label>To<input type="date" value={customTo} min={customFrom} onChange={event => setCustomTo(event.target.value)} /></label>
      </div> : <time className="attendance-range-label">{dateLabel(range.from)} – {dateLabel(range.to)}</time>}
    </div>
    {invalidRange ? <p className="attendance-alert" role="alert">From date must be on or before To date.</p> : null}

    <div className="attendance-statuses" role="group" aria-label="Filter attendance by status">
      {statuses.map(value => <button type="button" aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setPage(1); }} key={value}>{labels[value]} <span>{counts[value]}</span></button>)}
    </div>

    {attendanceStatus ? <p className="attendance-notice" role="status">{attendanceStatus}</p> : null}
    {notice ? <p className="attendance-notice attendance-notice-success" role="status">{notice}</p> : null}
    {error ? <div className="attendance-alert" role="alert">{error} <button type="button" onClick={() => void load()}>Try again</button></div> : null}

    <div className="attendance-records" aria-busy={loading}>
      <table aria-label="Personal attendance records">
        <thead><tr><th>Date</th><th>Shift</th><th>Actual In</th><th>Actual Out</th><th>Work Hours</th><th>Status</th></tr></thead>
        <tbody>
          {loading ? Array.from({ length: 7 }, (_, index) => <tr className="attendance-loading-row" key={index}><td colSpan={6}><span /></td></tr>) : visible.map(day => { const worked = durationFor(day); return <tr key={day.key}>
            <td data-label="Date"><time dateTime={day.key}>{dateLabel(day.key)}</time></td>
            <td data-label="Shift">{shiftLabel(day.status, data.settings)}</td>
            <td data-label="Actual In">{time(day.row?.clock_in)}</td>
            <td data-label="Actual Out">{time(day.row?.clock_out)}</td>
            <td data-label="Work Hours">{worked.minutes === null ? '—' : durationLabel(worked.minutes)}</td>
            <td data-label="Status"><StatusBadge status={labels[day.status] || day.status} /></td>
          </tr>; })}
        </tbody>
      </table>
      {!loading && !visible.length ? <CompactEmptyState title="No attendance records" description="No records match this period and status." /> : null}
    </div>
    {!loading ? <Pagination page={page} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} total={filtered.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /> : null}
  </section>;
}
