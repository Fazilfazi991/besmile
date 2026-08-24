import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Director normal-workforce boundary', () => {
  it('filters the employee directory, attendance lists, and normal employee selectors by canonical role', () => {
    const adminRepository = read('src/lib/admin-repository.ts');
    const employeeRepository = read('src/lib/employee-repository.ts');

    expect(adminRepository).toContain('.neq("role", "director")');
    expect(employeeRepository).toContain('.neq("role", "director")');
    expect(read('src/lib/employees.ts')).toContain(".neq('role','director')");
    expect(read('src/components/patient-ui.tsx')).toContain(".neq('role', 'director')");
    expect(read('src/components/patient-workspace.tsx')).toContain(".neq('role', 'director')");
  });

  it('keeps the server-side chat directory aligned without altering Director access controls', () => {
    const migration = read('supabase/migrations/20260824100000_exclude_director_from_normal_workforce_lists.sql');

    expect(migration).toContain("p.role <> 'director'");
    expect(migration).toContain('create or replace function public.meeting_workforce()');
    expect(migration).not.toContain('update public.profiles');
    expect(migration).not.toContain('delete from public.profiles');
    expect(migration).not.toContain('role_permissions');
  });
});
