import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../app/admin/employees/[id]/page.tsx', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/0079_general_manager_employee_actions.sql', import.meta.url), 'utf8');
const repairMigration = readFileSync(new URL('../../supabase/migrations/0080_sidebar_gm_operations_idea_schema_repair.sql', import.meta.url), 'utf8');

describe('General Manager employee actions', () => {
  it('does not expose access administration to the GM employee profile', () => {
    expect(page).toContain('canManageAccess: admin.role === "super_admin"');
    expect(page).toContain('canEdit &&');
    expect(page).toContain('canChangeStatus &&');
  });

  it('keeps employee update and status failures distinct', () => {
    expect(repository).toContain("throw new Error('Employee not found.')");
    expect(repository).toContain("throw new Error('You do not have permission to update this employee.')");
    expect(repository).toContain("rpc('change_employee_status'");
  });

  it('keeps status changes database-enforced and preserves authenticated on-leave sessions', () => {
    expect(migration).toContain("'employees.status.manage'");
    expect(migration).toContain('Protected management accounts cannot be changed');
    expect(migration).toContain('employee_status_history');
    expect(repairMigration).toContain("'employees.status.manage'");
    expect(repairMigration).toContain('permission.code = any(gm_removed)');
    expect(middleware).toContain("profile.status === 'inactive' || profile.status === 'terminated'");
    expect(middleware).not.toContain('signOut');
  });

  it('adds GM operations without access-management permissions', () => {
    expect(repairMigration).toContain("'employees.view','patients.view'");
    expect(repairMigration).toContain("'documents.employee.manage'");
    expect(repairMigration).toContain("'roles.view','roles.manage','permissions.view','permissions.manage'");
    expect(repairMigration).toContain('revoked_at = coalesce');
  });
});
