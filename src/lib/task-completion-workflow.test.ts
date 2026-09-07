import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completionUpdateError } from './task-workspace';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260907202602_require_task_completion_update.sql'), 'utf8');
const employeeRepository = readFileSync(resolve(process.cwd(), 'src/lib/employee-repository.ts'), 'utf8');
const adminRepository = readFileSync(resolve(process.cwd(), 'src/lib/admin-repository.ts'), 'utf8');
const adminPage = readFileSync(resolve(process.cwd(), 'src/app/admin/tasks/page.tsx'), 'utf8');
const employeePage = readFileSync(resolve(process.cwd(), 'src/app/employee/tasks/page.tsx'), 'utf8');
const compactEmployeeRepository = employeeRepository.replace(/\s+/g, '').replace(/'/g, '"');
const compactAdminRepository = adminRepository.replace(/\s+/g, '').replace(/'/g, '"');

describe('required task completion update', () => {
  it('rejects empty, whitespace-only, and oversized completion updates', () => {
    expect(completionUpdateError('')).toMatch(/required/i);
    expect(completionUpdateError('   ')).toMatch(/required/i);
    expect(completionUpdateError('x'.repeat(2001))).toMatch(/2,000/i);
    expect(completionUpdateError('Completed the requested work.')).toBeNull();
  });

  it('atomically stores the update against the same task before changing status', () => {
    const insert = migration.indexOf('insert into public.task_comments(task_id, author_id, body)');
    const update = migration.indexOf("update public.task_assignments set status = 'completed'");
    expect(insert).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(insert);
    expect(migration).toContain('values (assignment.task_id, auth.uid(), message)');
    expect(compactEmployeeRepository).toContain('rpc("complete_task_assignment"');
    expect(compactAdminRepository).toContain('rpc("complete_managed_task"');
  });

  it('keeps submitter identity and existing permission boundaries explicit', () => {
    expect(migration).toContain('assignment.profile_id <> auth.uid()');
    expect(migration).toContain("public.has_permission('tasks.manage') or public.has_permission('tasks.assign')");
    expect(migration).toContain('public.can_manage_task_assignment(task.id, assignment.profile_id)');
    expect(migration).toContain('author_id, body) values (task.id, auth.uid(), message)');
    expect(migration).toContain('revoke all on function public.complete_task_assignment(uuid, text) from public');
  });

  it('leaves non-completion status changes on the existing repository path', () => {
    expect(employeeRepository).toContain('.from("task_assignments")');
    expect(employeeRepository).toContain('.update({ status })');
    expect(adminRepository).toContain('async setTaskStatus(');
  });

  it('shows the canonical creator as Task Owner and handles missing users', () => {
    for (const page of [adminPage, employeePage]) {
      expect(page).toContain('Task Owner');
      expect(page).toContain('created_by_profile?.full_name');
      expect(page).toContain('Former or unavailable user');
      expect(page).toContain('Completion SLA');
    }
  });
});
