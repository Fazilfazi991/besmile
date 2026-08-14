import { describe, expect, it } from 'vitest';
import { attentionItems } from './work-performance-rules';

describe('work-performance attention rules', () => {
  const base = { id: 'employee-1', full_name: 'Asha', on_leave: false, attendance_recorded: false };

  it('uses only current workload facts and a visible high-workload threshold', () => {
    expect(attentionItems([{ ...base, open_tasks: 8, overdue_tasks: 2, due_today_tasks: 1 }])).toEqual([
      expect.objectContaining({ kind: 'overdue', detail: '2 overdue current tasks' }),
      expect.objectContaining({ kind: 'due_today', detail: '1 current task due today' }),
      expect.objectContaining({ kind: 'high_workload', detail: '8 current open tasks (attention threshold: 8)' }),
    ]);
  });

  it('marks zero current workload without inferring absence or performance', () => {
    expect(attentionItems([{ ...base, open_tasks: 0, overdue_tasks: 0, due_today_tasks: 0 }])).toEqual([
      expect.objectContaining({ kind: 'no_open_tasks', detail: 'No current open tasks' }),
    ]);
  });
});
