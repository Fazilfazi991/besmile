'use client';

import { useEffect, useMemo, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { canClockIn, dateKey, minutes, monthlyDays, weekday } from '@/lib/attendance-rules';
import { awarenessEventsForMonth } from '@/lib/calendar-events';
import { freshLocation } from '@/lib/attendance-geofence';
import { EmployeeBanner, EmployeeLoading, EmployeeMetric, EmployeeMetricGrid, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';

const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const statusStyle: Record<string, string> = {
  present: 'border-emerald-200 bg-emerald-50 text-emerald-800', late: 'border-amber-200 bg-amber-50 text-amber-800',
  absent: 'border-rose-200 bg-rose-50 text-rose-800', leave: 'border-sky-200 bg-sky-50 text-sky-800',
  weekend: 'border-slate-200 bg-slate-100 text-slate-500', holiday: 'border-violet-200 bg-violet-50 text-violet-800', future: 'border-slate-200 bg-white text-slate-400',
};
const statusTone: Record<string, any> = { present: 'success', late: 'pending', absent: 'danger', leave: 'info', weekend: 'default', holiday: 'info', future: 'default' };
const label = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : 'Unknown';
const time = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
const duration = (value: number) => `${Math.floor(value / 60)}h ${value % 60}m`;

export default function AttendancePage() {
  const [profile, setProfile] = useState<any>();
  const [month, setMonth] = useState(new Date());
  const [data, setData] = useState<any>();
  const [selected, setSelected] = useState<any>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState(false);

  const load = async () => {
    setError('');
    try {
      const employee = await currentProfile() as any;
      if (!employee) throw Error('Your session has expired.');
      setProfile(employee);
      const from = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
      const to = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
      const result = await employeeRepository.attendanceRules(employee.id, from, to);
      const days = monthlyDays(month, result.settings, result.attendance, new Set(result.holidays.map((holiday: any) => holiday.holiday_date)), result.leaves);
      const awareness = awarenessEventsForMonth(result.awareness || [], month.getFullYear(), month.getMonth() + 1);
      const holidayEvents = new Map<string, any[]>();
      (result.holidays || []).forEach((holiday: any) => holidayEvents.set(holiday.holiday_date, [{ name: holiday.name, category: 'holiday', date: holiday.holiday_date }]));
      setData({ ...result, days, awarenessByDay: awareness.days, awarenessPeriods: awareness.periods, holidayEvents });
      const todayKey = dateKey(new Date(), result.settings.timezone);
      setSelected((current: any) => current && days.some((day: any) => day.key === current.key) ? days.find((day: any) => day.key === current.key) : days.find((day: any) => day.key === todayKey) || days[0]);
    } catch (caught: any) { setError(caught.message || 'Unable to load attendance.'); }
  };
  useEffect(() => { void load(); }, [month]);

  const today = data ? dateKey(new Date(), data.settings.timezone) : '';
  const activeToday = data?.days?.find((day: any) => day.key === today);
  const activeBreak = activeToday?.row?.attendance_breaks?.find((item: any) => !item.ended_at);
  const attendanceAction = async (action: 'clockIn' | 'clockOut' | 'startBreak' | 'endBreak') => {
    if (!profile) return;
    setActing(true); setError(''); setNotice('');
    try {
      if (action === 'clockIn') await employeeRepository.clockIn(profile.id, await freshLocation());
      if (action === 'clockOut' && activeToday?.row) await employeeRepository.clockOut(activeToday.row.id, await freshLocation());
      if (action === 'startBreak' && activeToday?.row) await employeeRepository.startBreak(activeToday.row.id);
      if (action === 'endBreak' && activeBreak) await employeeRepository.endBreak(activeBreak.id);
      setNotice('Attendance updated.');
      await load();
    } catch (caught: any) { setError(caught.message || 'Attendance could not be updated.'); }
    finally { setActing(false); }
  };

  const summary = useMemo(() => {
    if (!data) return { present: 0, absent: 0, leave: 0, work: 0 };
    return {
      present: data.days.filter((day: any) => day.status === 'present' || day.status === 'late').length,
      absent: data.days.filter((day: any) => day.status === 'absent').length,
      leave: data.days.filter((day: any) => day.status === 'leave').length,
      work: data.days.reduce((total: number, day: any) => total + minutes(day.row), 0),
    };
  }, [data]);

  if (!data && !error) return <section><EmployeePageHeader title="Attendance" subtitle="View your monthly attendance and working time." /><EmployeeLoading cards={3} /></section>;
  if (error && !data) return <section><EmployeePageHeader title="Attendance" subtitle="View your monthly attendance and working time." /><EmployeeBanner>{error}</EmployeeBanner><button className="btn btn-primary" onClick={() => void load()}>Try again</button></section>;
  const firstOffset = weekday(new Date(`${data.days[0].key}T12:00:00Z`), data.settings.timezone) - 1;
  const todayStatus = activeToday?.row?.clock_in ? label(activeToday.status) : activeToday?.status === 'absent' ? 'Not clocked in' : label(activeToday?.status || '');
  const clockInAllowed = canClockIn(activeToday?.status || 'future');

  return <section className="space-y-4">
    <EmployeePageHeader title="Attendance" subtitle="View your monthly attendance and working time." action={<div className="flex flex-wrap items-center justify-end gap-2"><button className="btn border px-3 py-1.5 text-xs" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1))}>Previous</button><div className="min-w-36 text-center text-sm font-bold">{month.toLocaleString('en', { month: 'long', year: 'numeric' })}</div><button className="btn border px-3 py-1.5 text-xs" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1))}>Next</button><button className="btn border px-3 py-1.5 text-xs" onClick={() => setMonth(new Date())}>Today</button></div>} />
    <EmployeeSection title="Today's attendance" description={activeToday?.row?.clock_in ? 'Your current attendance and working time.' : 'Start your day when you are ready.'} className="border-teal-100">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Detail label="Current status" value={activeBreak ? 'On break' : todayStatus} /><Detail label="Clock in" value={time(activeToday?.row?.clock_in)} /><Detail label="Break" value={activeBreak ? `Since ${time(activeBreak.started_at)}` : activeToday?.row?.break_minutes ? `${activeToday.row.break_minutes} min` : '—'} /><Detail label="Clock out" value={time(activeToday?.row?.clock_out)} /><Detail label="Working hours" value={activeToday?.row?.clock_in ? duration(minutes(activeToday.row)) : '—'} /></div>
        <div className="flex flex-wrap gap-2 lg:justify-end">{!activeToday?.row && <button className="btn btn-primary" disabled={acting || !clockInAllowed} title={clockInAllowed ? undefined : `Clock-in is unavailable on ${activeToday?.status || 'this day'}.`} onClick={() => void attendanceAction('clockIn')}>{acting ? 'Clocking in...' : 'Clock in'}</button>}{activeToday?.row && !activeToday.row.clock_out && !activeBreak && <><button className="btn border" disabled={acting} onClick={() => void attendanceAction('startBreak')}>{acting ? 'Updating...' : 'Start break'}</button><button className="btn btn-primary" disabled={acting} onClick={() => void attendanceAction('clockOut')}>{acting ? 'Clocking out...' : 'Clock out'}</button></>}{activeBreak && <button className="btn btn-primary" disabled={acting} onClick={() => void attendanceAction('endBreak')}>{acting ? 'Updating...' : 'End break'}</button>}</div>
      </div>
    </EmployeeSection>
    <EmployeeMetricGrid columns={4}><EmployeeMetric label="Present" value={summary.present} tone="success" /><EmployeeMetric label="Absent" value={summary.absent} tone="danger" /><EmployeeMetric label="Leave" value={summary.leave} tone="info" /><EmployeeMetric label="Working hours" value={duration(summary.work)} /></EmployeeMetricGrid>
    {notice && <EmployeeBanner tone="success">{notice}</EmployeeBanner>}{error && <EmployeeBanner>{error}</EmployeeBanner>}
    <div className="flex flex-wrap gap-2">{['present', 'late', 'absent', 'leave', 'holiday', 'weekend'].map(status => <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600" key={status}><span className={`h-2 w-2 rounded-full ${status === 'present' ? 'bg-emerald-500' : status === 'late' ? 'bg-amber-500' : status === 'leave' ? 'bg-sky-500' : status === 'holiday' ? 'bg-violet-500' : 'bg-slate-400'}`} />{label(status)}</span>)}<span className="flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs text-teal-800"><span className="h-2 w-2 rounded-full bg-teal-500" />Awareness day</span></div>
    <EmployeeSection title="Monthly calendar" description="Public holidays and awareness events appear alongside attendance. Select a day for details.">{data.awarenessPeriods.length > 0 && <div className="mx-3 mt-3 flex flex-wrap gap-2 sm:mx-4">{data.awarenessPeriods.map((event: any) => <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800" title={event.notes || undefined} key={event.name}>{event.name}{event.notes ? ' · dates to be confirmed' : ''}</span>)}</div>}<div className="mx-auto grid max-w-6xl grid-cols-7 gap-1.5 p-3 sm:gap-2 md:p-4">{weekdayNames.map(name => <div className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs" key={name}>{name}</div>)}{Array.from({ length: firstOffset }).map((_, index) => <div aria-hidden="true" key={`empty-${index}`} />)}{data.days.map((day: any) => { const isToday = day.key === today; const selectedDay = selected?.key === day.key; const worked = minutes(day.row); const statusText = day.status === 'future' ? '' : label(day.status); const events = [...(data.holidayEvents.get(day.key) || []), ...(data.awarenessByDay.get(day.key) || [])]; return <button onClick={() => setSelected(day)} className={`relative min-h-[72px] overflow-hidden rounded-lg border p-1.5 text-left transition hover:brightness-[.98] sm:min-h-[86px] sm:p-2 ${statusStyle[day.status] || statusStyle.future} ${isToday ? 'ring-2 ring-teal-500 ring-offset-1' : ''} ${selectedDay ? 'shadow-sm' : ''}`} key={day.key}><span className="block text-sm font-extrabold">{day.key.slice(-2)}</span>{isToday && <span className="mt-1 inline-flex rounded bg-teal-700 px-1.5 py-0.5 text-[9px] font-bold text-white">Today</span>}{statusText && <span className="mt-1 block text-[10px] font-semibold sm:text-xs">{statusText}</span>}{events.slice(0, 2).map((event: any) => <span className={`mt-1 block truncate rounded px-1 text-[8px] font-bold leading-4 sm:text-[9px] ${event.category === 'holiday' ? 'bg-violet-100 text-violet-800' : 'bg-teal-100 text-teal-800'}`} title={event.name} key={`${event.category}-${event.name}`}>{event.name}</span>)}{events.length > 2 && <span className="block text-[9px] font-bold text-slate-600">+{events.length - 2} more</span>}{(day.status === 'present' || day.status === 'late') && <span className="mt-0.5 block text-[9px] sm:text-[10px]">{duration(worked)}</span>}</button>; })}</div></EmployeeSection>
    {selected && <div className="grid gap-4 lg:grid-cols-2"><EmployeeSection title="Selected day" action={<EmployeeStatusBadge tone={statusTone[selected.status]}>{label(selected.status)}</EmployeeStatusBadge>}><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Selected date" value={new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${selected.key}T12:00:00`))} /><Detail label="Status" value={label(selected.status)} /><Detail label="Clock in" value={time(selected.row?.clock_in)} /><Detail label="Clock out" value={time(selected.row?.clock_out)} /><Detail label="Working hours" value={selected.row?.clock_in ? duration(minutes(selected.row)) : '—'} /></div>{!selected.row && <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">No attendance recorded.</p>}</EmployeeSection>{selected.row && <EmployeeSection title="Attendance timeline" description="Clock-in and clock-out activity."><div className="divide-y divide-slate-100 px-4">{[{ at: selected.row.clock_in, title: 'Clock in' }, { at: selected.row.clock_out, title: 'Clock out' }].filter(event => event.at).map((event, index) => <div className="flex items-center gap-3 py-3" key={`${event.title}-${index}`}><time className="w-20 text-sm font-bold text-teal-800">{time(event.at)}</time><span className="h-2.5 w-2.5 rounded-full bg-teal-500" /><span className="text-sm font-medium text-slate-800">{event.title}</span></div>)}</div></EmployeeSection>}</div>}
    {selected && <EmployeeSection title="Calendar events"><div className="p-4">{[...(data.holidayEvents.get(selected.key) || []), ...(data.awarenessByDay.get(selected.key) || [])].length ? <ul className="space-y-1">{[...(data.holidayEvents.get(selected.key) || []), ...(data.awarenessByDay.get(selected.key) || [])].map((event: any) => <li className="text-sm text-slate-700" key={`${event.category}-${event.name}`}><span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${event.category === 'holiday' ? 'bg-violet-100 text-violet-800' : 'bg-teal-100 text-teal-800'}`}>{event.category === 'holiday' ? 'Holiday' : 'Awareness'}</span>{event.name}</li>)}</ul> : <p className="text-sm text-slate-500">No public holiday or awareness event on this date.</p>}</div></EmployeeSection>}
  </section>;
}

function Detail({ label: title, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 px-3 py-2.5"><span className="block text-xs text-slate-500">{title}</span><b className="mt-1 block text-sm">{value}</b></div>; }
