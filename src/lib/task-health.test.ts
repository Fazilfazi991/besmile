import { describe, expect, it } from 'vitest';
import { employeeTaskHealth, taskHealth } from './task-health';

const settings = { timezone: 'Asia/Kolkata', work_start: '09:00', working_days: [1, 2, 3, 4, 5] };

describe('task health', () => {
  it('uses SLA warning and overdue thresholds', () => {
    const task = { status: 'todo', start_date: '2026-08-10', sla_duration: 4, sla_unit: 'working_days' };
    expect(taskHealth(task, settings, new Date('2026-08-11T06:00:00Z'))).toBe('on_track');
    expect(taskHealth(task, settings, new Date('2026-08-14T12:00:00Z'))).toBe('at_risk');
    expect(taskHealth(task, settings, new Date('2026-08-15T12:00:00Z'))).toBe('overdue');
  });
  it('keeps legacy due-date tasks and future work safe', () => {
    expect(taskHealth({ status: 'todo', due_date: '2026-08-10' }, settings, new Date('2026-08-11T12:00:00Z'))).toBe('overdue');
    expect(taskHealth({ status: 'todo', start_date: '2026-08-20', due_date: '2026-08-10' }, settings, new Date('2026-08-11T12:00:00Z'))).toBe('on_track');
  });
  it('uses the worst active assigned-task health and excludes completed work', () => {
    expect(employeeTaskHealth([{ assignment_status: 'completed', due_date: '2026-08-10' }, { assignment_status: 'todo', due_date: '2026-08-20', created_at: '2026-08-01T09:00:00Z' }], settings, new Date('2026-08-11T12:00:00Z')).health).toBe('on_track');
    expect(employeeTaskHealth([{ assignment_status: 'todo', due_date: '2026-08-20' }, { assignment_status: 'todo', due_date: '2026-08-10' }], settings, new Date('2026-08-11T12:00:00Z')).health).toBe('overdue');
  });
});
