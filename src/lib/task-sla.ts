import { supabase } from './supabase';

export type TaskWorkSchedule = { workingDays: Set<number>; holidays: Set<string> };
export const defaultTaskWorkSchedule = (): TaskWorkSchedule => ({ workingDays: new Set([1, 2, 3, 4, 5, 6]), holidays: new Set() });

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`);

export function taskCompletionSla(task: { created_at?: string | null; due_date?: string | null }, schedule: TaskWorkSchedule) {
  if (!task.created_at || !task.due_date) return null;
  const created = task.created_at.slice(0, 10);
  const due = task.due_date.slice(0, 10);
  if (due < created) return null;
  let days = 0;
  for (const cursor = utcDate(created); dateKey(cursor) <= due; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = dateKey(cursor);
    const isoWeekday = cursor.getUTCDay() || 7;
    if (schedule.workingDays.has(isoWeekday) && !schedule.holidays.has(key)) days += 1;
  }
  return days;
}

export function taskCompletionSlaLabel(task: { created_at?: string | null; due_date?: string | null }, schedule: TaskWorkSchedule) {
  const days = taskCompletionSla(task, schedule);
  return days === null ? 'Unavailable' : `${days} Working ${days === 1 ? 'Day' : 'Days'}`;
}

export async function loadTaskWorkSchedule(): Promise<TaskWorkSchedule> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const [settings, events] = await Promise.all([
    supabase.from('company_attendance_settings').select('working_days').eq('id', true).maybeSingle(),
    supabase.from('holiday_calendar_events').select('start_date,end_date').eq('is_non_working_day', true).not('start_date', 'is', null),
  ]);
  if (settings.error) throw settings.error;
  if (events.error) throw events.error;
  const holidays = new Set<string>();
  for (const event of events.data || []) {
    if (!event.start_date) continue;
    const end = event.end_date || event.start_date;
    for (const cursor = utcDate(event.start_date); dateKey(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) holidays.add(dateKey(cursor));
  }
  return { workingDays: new Set(settings.data?.working_days || [1, 2, 3, 4, 5, 6]), holidays };
}
