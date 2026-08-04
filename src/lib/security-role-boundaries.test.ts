import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isSecurityAdministratorRole } from './permission-access';

describe('security administration boundary', () => {
  it('recognizes only the actual super_admin role as a security administrator', () => {
    expect(isSecurityAdministratorRole('super_admin')).toBe(true);
    for (const role of ['chairman', 'director', 'general_manager', 'Guest – Sales']) expect(isSecurityAdministratorRole(role)).toBe(false);
  });

  it('revokes protected permissions from every legacy management role spelling', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0049_security_permissions_super_admin_only.sql'), 'utf8');
    expect(migration).toContain("in ('chairman', 'director', 'general_manager')");
    expect(migration).toContain("<> 'super_admin'");
    expect(migration).toContain("'roles.manage'");
    expect(migration).toContain("'permissions.manage'");
    expect(migration).toContain("'system.override'");
  });

  it('restores only the employee self-service baseline for scoped roles', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0050_employee_self_service_permission_baseline.sql'), 'utf8');
    expect(migration).toContain("'attendance.self'");
    expect(migration).toContain("'leave.self'");
    expect(migration).toContain("'tasks.view_self'");
    expect(migration).not.toContain("'roles.manage'");
  });
});
