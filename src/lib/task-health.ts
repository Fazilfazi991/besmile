import { dateKey } from './attendance-rules';
import { businessDateTime } from './calendar-meeting-rules';

export const TASK_HEALTH_WARNING_FRACTION = 0.25;
export type TaskHealth = 'on_track' | 'at_risk' | 'overdue';
export type TaskHealthSettings = { timezone: string; work_start?: string | null; working_days?: number[] | null };
export type HealthTask = {
  status?: string | null; assignment_status?: string | null; due_date?: string | null; start_date?: string | null;
  sla_duration?: number | string | null; sla_unit?: string | null; sla_deadline?: string | null; created_at?: string | null;
};

const activeStatus = (task: HealthTask) => task.assignment_status || task.status || 'todo';
const dateOnly = (value: Date, timezone: string) => dateKey(value, timezone);
const endOfBusinessDay = (date: string, timezone: string) => new Date(businessDateTime(date, '23:59', timezone));
const startOfBusinessDay = (date: string, settings: TaskHealthSettings) => new Date(businessDateTime(date, settings.work_start || '09:00', settings.timezone));

function addWorkingDays(start: string, count: number, days: number[], timezone: string) {
  const date = new Date(`${start}T12:00:00Z`);
  let remaining = Math.ceil(count);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (days.includes(date.getUTCDay())) remaining -= 1;
  }
  return dateOnly(date, timezone);
}

export function effectiveTaskDeadline(task: HealthTask, settings: TaskHealthSettings): Date | null {
  if (task.sla_deadline) return new Date(task.sla_deadline);
  const duration = Number(task.sla_duration);
  if (duration > 0 && task.sla_unit) {
    const start = task.start_date || (task.created_at ? dateOnly(new Date(task.created_at), settings.timezone) : null);
    if (start) {
      if (task.sla_unit === 'hours') return new Date(startOfBusinessDay(start, settings).getTime() + duration * 3_600_000);
      if (task.sla_unit === 'working_days') {
        const deadline = addWorkingDays(start, duration, settings.working_days?.length ? settings.working_days : [1, 2, 3, 4, 5], settings.timezone);
        return endOfBusinessDay(deadline, settings.timezone);
      }
    }
  }
  return task.due_date ? endOfBusinessDay(task.due_date, settings.timezone) : null;
}

export function taskHealth(task: HealthTask, settings: TaskHealthSettings, now = new Date()): TaskHealth {
  if (activeStatus(task) === 'completed') return 'on_track';
  if (task.start_date && task.start_date > dateOnly(now, settings.timezone)) return 'on_track';
  const deadline = effectiveTaskDeadline(task, settings);
  if (!deadline) return 'on_track';
  if (now >= deadline) return 'overdue';
  const start = task.start_date ? startOfBusinessDay(task.start_date, settings) : task.created_at ? new Date(task.created_at) : null;
  if (!start || deadline <= start) return 'at_risk';
  return deadline.getTime() - now.getTime() <= (deadline.getTime() - start.getTime()) * TASK_HEALTH_WARNING_FRACTION ? 'at_risk' : 'on_track';
}

export function employeeTaskHealth(tasks: HealthTask[], settings: TaskHealthSettings, now = new Date()) {
  const active = tasks.filter(task => activeStatus(task) !== 'completed');
  const health = active.reduce<TaskHealth>((worst, task) => {
    const candidate = taskHealth(task, settings, now);
    return candidate === 'overdue' || (candidate === 'at_risk' && worst === 'on_track') ? candidate : worst;
  }, 'on_track');
  return { health, active: active.length, overdue: active.filter(task => taskHealth(task, settings, now) === 'overdue').length, atRisk: active.filter(task => taskHealth(task, settings, now) === 'at_risk').length };
}
