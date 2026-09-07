import { businessDateTime } from './calendar-meeting-rules';

export const TASK_HEALTH_WARNING_FRACTION = 0.25;
export type TaskHealth = 'on_track' | 'at_risk' | 'overdue';
export type TaskHealthSettings = { timezone: string; work_start?: string | null; working_days?: number[] | null };
export type HealthTask = {
  status?: string | null; assignment_status?: string | null; due_date?: string | null; created_at?: string | null;
};

const activeStatus = (task: HealthTask) => task.assignment_status || task.status || 'todo';
const endOfBusinessDay = (date: string, timezone: string) => new Date(businessDateTime(date, '23:59', timezone));

export function effectiveTaskDeadline(task: HealthTask, settings: TaskHealthSettings): Date | null {
  return task.due_date ? endOfBusinessDay(task.due_date, settings.timezone) : null;
}

export function taskHealth(task: HealthTask, settings: TaskHealthSettings, now = new Date()): TaskHealth {
  if (activeStatus(task) === 'completed') return 'on_track';
  const deadline = effectiveTaskDeadline(task, settings);
  if (!deadline) return 'on_track';
  if (now >= deadline) return 'overdue';
  const start = task.created_at ? new Date(task.created_at) : null;
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
