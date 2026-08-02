import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0054_operational_audit_visibility.sql', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');

describe('employee operational activity access', () => {
  it('keeps operational activity separate from the security audit table', () => {
    expect(migration).toContain('create table if not exists public.employee_activity_logs');
    expect(migration).toContain('source_audit_id uuid unique references public.audit_logs');
    expect(repository).toContain("r.from('employee_activity_logs')");
  });

  it('limits General Manager access to their reporting tree', () => {
    expect(migration).toContain("public.current_role() = 'general_manager' and public.in_management_tree(profile_id)");
    expect(migration).not.toContain('create policy "security audit super admin only"');
  });

  it('records only a safe operational field set', () => {
    for (const field of ['full_name', 'phone', 'department_id', 'designation', 'manager_id', 'joining_date', 'employment_type', 'status']) expect(migration).toContain(`'${field}'`);
    expect(migration).not.toContain("'password'");
    expect(migration).not.toContain("'token'");
  });
});
