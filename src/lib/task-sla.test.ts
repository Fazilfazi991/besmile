import { describe, expect, it } from 'vitest';
import { taskCompletionSla, taskCompletionSlaLabel, type TaskWorkSchedule } from './task-sla';

const schedule = (workingDays = [1, 2, 3, 4, 5], holidays: string[] = []): TaskWorkSchedule => ({ workingDays: new Set(workingDays), holidays: new Set(holidays) });

describe('derived task completion SLA', () => {
  it('counts a normal weekday range inclusively', () => {
    expect(taskCompletionSla({ created_at: '2026-09-07T08:00:00Z', due_date: '2026-09-09' }, schedule())).toBe(3);
  });

  it('excludes organization weekly offs', () => {
    expect(taskCompletionSla({ created_at: '2026-09-04T08:00:00Z', due_date: '2026-09-07' }, schedule())).toBe(2);
  });

  it('excludes canonical non-working holidays', () => {
    expect(taskCompletionSla({ created_at: '2026-09-07T08:00:00Z', due_date: '2026-09-09' }, schedule(undefined, ['2026-09-08']))).toBe(2);
  });

  it('treats a task created and due on the same working day as one day', () => {
    const task = { created_at: '2026-09-07T08:00:00Z', due_date: '2026-09-07' };
    expect(taskCompletionSla(task, schedule())).toBe(1);
    expect(taskCompletionSlaLabel(task, schedule())).toBe('1 Working Day');
  });

  it('returns unavailable for a due date before creation', () => {
    const task = { created_at: '2026-09-08T08:00:00Z', due_date: '2026-09-07' };
    expect(taskCompletionSla(task, schedule())).toBeNull();
    expect(taskCompletionSlaLabel(task, schedule())).toBe('Unavailable');
  });
});
