import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignmentProgress,
  assignmentProgressLabel,
  assignmentStatusLabel,
  assignmentWording,
} from './task-workspace';

const assignment = (status: 'todo' | 'in_progress' | 'completed') => ({ status });
const adminPage = readFileSync(resolve(process.cwd(), 'src/app/admin/tasks/page.tsx'), 'utf8');
const employeePage = readFileSync(resolve(process.cwd(), 'src/app/employee/tasks/page.tsx'), 'utf8');

describe('task status clarity presentation', () => {
  it('summarizes single-assignment progress', () => {
    expect(assignmentProgress([assignment('todo')])).toEqual({ completed: 0, total: 1 });
    expect(assignmentProgressLabel([assignment('todo')])).toBe('0 of 1 assignment completed');
    expect(assignmentProgressLabel([assignment('completed')])).toBe('1 of 1 assignment completed');
    expect(assignmentWording(1)).toBe('assignment');
    expect(assignmentStatusLabel('todo')).toBe('To Do');
  });

  it('summarizes multi-assignment progress', () => {
    expect(assignmentProgressLabel([assignment('todo'), assignment('in_progress')])).toBe('0 of 2 assignments completed');
    expect(assignmentProgressLabel([assignment('completed'), assignment('todo')])).toBe('1 of 2 assignments completed');
    expect(assignmentProgressLabel([assignment('completed'), assignment('completed')])).toBe('2 of 2 assignments completed');
    expect(assignmentProgressLabel([assignment('completed'), assignment('todo')], true)).toBe('1 of 2 completed');
    expect(assignmentWording(2)).toBe('assignments');
  });

  it('does not infer completion from comments', () => {
    const assignmentWithComment = { status: 'todo' as const, comments: [{ body: 'Progress shared.' }] };
    expect(assignmentProgressLabel([assignmentWithComment])).toBe('0 of 1 assignment completed');
    expect(adminPage).toContain('Progress updates are comments and do not change an assignment’s');
  });

  it('keeps management parent status separate from assignment progress', () => {
    expect(adminPage).toContain('Task status:');
    expect(adminPage).toContain('Assignment progress');
    expect(adminPage).toContain('assignmentStatusLabel(assignment.status)');
  });

  it('labels employee metrics and details as assignment-scoped', () => {
    expect(employeePage).toContain('My assignment status');
    expect(employeePage).toContain('Counts reflect your assignments. An overall task may remain open until');
    expect(employeePage).toContain('taskCounts(tasks, today)');
  });
});
