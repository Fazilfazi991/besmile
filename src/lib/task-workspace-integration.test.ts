import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const employeePage = readFileSync(new URL('../app/employee/tasks/page.tsx', import.meta.url), 'utf8');
const adminPage = readFileSync(new URL('../app/admin/tasks/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/0078_task_workspace_permissions_and_refresh.sql', import.meta.url), 'utf8');

describe('task workspace integration', () => {
  it('uses optimistic employee status updates with rollback and focused refresh', () => {
    expect(employeePage).toContain('applyAssignmentStatus');
    expect(employeePage).toContain('setTasks(previous)');
    expect(employeePage).toContain('await loadTasks(profile)');
    expect(employeePage).toContain('Retry task list');
  });

  it('keeps GM task and assignee failures separate after successful mutations', () => {
    expect(adminPage).toContain("['tasks.manage', 'tasks.assign']");
    expect(adminPage).toContain('Promise.allSettled');
    expect(adminPage).toContain('Assignee list could not be loaded');
    expect(adminPage).toContain('router.refresh()');
  });

  it('enforces active employee ownership and canonical task transitions in RLS', () => {
    expect(migration).toContain("'tasks.manage'");
    expect(migration).toContain('Employees can only update their own assigned task status');
    expect(migration).toContain("old.status = 'todo' and new.status = 'in_progress'");
    expect(migration).toContain('task_assignments_sync_task_status');
    expect(migration).toContain('Task completed');
  });
});
