import { describe, expect, it } from 'vitest';
import { applyAssignmentStatus, canEmployeeChangeTaskStatus, taskCounts } from './task-workspace';

describe('task workspace state', () => {
  it('allows only employee-owned workflow transitions', () => {
    expect(canEmployeeChangeTaskStatus('todo', 'in_progress')).toBe(true);
    expect(canEmployeeChangeTaskStatus('in_progress', 'completed')).toBe(true);
    expect(canEmployeeChangeTaskStatus('completed', 'in_progress')).toBe(true);
    expect(canEmployeeChangeTaskStatus('todo', 'completed')).toBe(false);
  });

  it('updates the changed assignment and derives fresh counters', () => {
    const tasks = [
      { id: 'a', status: 'todo' as const, tasks: { status: 'todo', due_date: '2026-07-01' } },
      { id: 'b', status: 'in_progress' as const, tasks: { status: 'in_progress', due_date: null } },
    ];
    const updated = applyAssignmentStatus(tasks, 'a', 'in_progress');
    expect(updated[0].status).toBe('in_progress');
    expect(taskCounts(updated, '2026-07-02')).toEqual({ todo: 0, in_progress: 2, completed: 0, overdue: 1 });
  });
});
