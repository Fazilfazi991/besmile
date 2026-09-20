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
const desktopCard = adminPage.slice(adminPage.indexOf('function TaskCard'));
const taskDetail = adminPage.slice(adminPage.indexOf('function TaskDetail'), adminPage.indexOf('function TaskCard'));

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

  it('opens every desktop task status through one keyboard-accessible primary button', () => {
    expect(desktopCard).toContain('data-testid="desktop-task-card-primary"');
    expect(desktopCard).toContain('type="button"');
    expect(desktopCard).toContain('onClick={onOpen}');
    expect(desktopCard).toContain('focus-visible:outline');
    expect(desktopCard).not.toMatch(/task\.status\s*===\s*["']completed["'][\s\S]{0,120}onClick=\{onOpen\}/);
  });

  it('keeps the desktop action menu outside the primary card button', () => {
    const primary = desktopCard.indexOf('data-testid="desktop-task-card-primary"');
    const primaryClose = desktopCard.indexOf('</button>', primary);
    const actions = desktopCard.indexOf('data-testid="desktop-task-card-actions"');
    expect(primary).toBeGreaterThan(-1);
    expect(primaryClose).toBeGreaterThan(primary);
    expect(actions).toBeGreaterThan(primaryClose);
  });

  it('resolves an open detail from the latest task collection after refresh', () => {
    type Task = { id: string; task_comments: Array<{ body: string }> };
    const detailTaskId = 'task-under-review';
    let tasks: Task[] = [{ id: detailTaskId, task_comments: [] }];
    const detailTask = () => tasks.find(task => task.id === detailTaskId);

    expect(detailTask()?.task_comments).toHaveLength(0);
    tasks = [{ id: detailTaskId, task_comments: [{ body: 'Fresh completion update' }] }];
    expect(detailTask()?.task_comments).toEqual([{ body: 'Fresh completion update' }]);

    expect(adminPage).toContain('const [detailTaskId, setDetailTaskId]');
    expect(adminPage).toContain('tasks.find(task => task.id === detailTaskId)');
    expect(adminPage).toContain('onOpen={() => setDetailTaskId(task.id)}');
    expect(adminPage).toContain('task={detailTask}');
    expect(adminPage).toContain('onClose={() => setDetailTaskId(undefined)}');
    expect(adminPage).not.toContain('const [detail, setDetail]');
  });

  it('shows truthful completion and assignment status timing when available', () => {
    expect(taskDetail).toContain('task.completed_at &&');
    expect(taskDetail).toContain('Completed at');
    expect(taskDetail).toContain('assignment.updated_at &&');
    expect(taskDetail).toContain('Last status update');
  });

  it('renders full chronological update text with author and timestamp', () => {
    expect(taskDetail).toContain('comment.author_profile?.full_name');
    expect(taskDetail).toContain('{comment.body}');
    expect(taskDetail).toContain('comment.created_at');
    expect(taskDetail).toContain('whitespace-pre-wrap');
    expect(taskDetail).not.toContain('line-clamp');
    expect(taskDetail).not.toMatch(/comment\.body\.(?:slice|substring|substr)\(/);
  });

  it('labels employee metrics and details as assignment-scoped', () => {
    expect(employeePage).toContain('My assignment status');
    expect(employeePage).toContain('Counts reflect your assignments. An overall task may remain open until');
    expect(employeePage).toContain('taskCounts(tasks, today)');
  });
});
