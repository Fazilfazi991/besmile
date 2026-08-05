import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0077_administration_admin_permission_bundle.sql'), 'utf8');

describe('Administration Admin permission bundle migration', () => {
  it('grants Diya through a reusable Administration/Admin bundle', () => {
    expect(migration).toContain('designation_permission_bundles');
    expect(migration).toContain("'Administration Admin'");
    expect(migration).toContain("values ('Administration Admin', 'Administration', 'Admin', true)");
    expect(migration).toContain('designation_permission_bundle_permissions');
    expect(migration).not.toContain("subject.email = 'diyaadminbsmile@gmail.com'");
  });

  it('keeps restricted finance, payroll, roles, leave approval, and clinical permissions out', () => {
    for (const permission of ['finance.dashboard.view', 'payroll.view', 'roles.manage', 'permissions.manage', 'leave.approve', 'clinical_notes.edit', 'crm.delete']) {
      expect(migration).toContain(`'${permission}'`);
    }
    expect(migration).toContain('delete from public.designation_permission_bundle_permissions');
  });

  it('preserves Diya as staff while updating the existing profile only', () => {
    expect(migration).toContain("role = 'staff'::public.app_role");
    expect(migration).toContain("lower(profile.email) = 'diyaadminbsmile@gmail.com'");
    expect(migration).toContain("profile.employee_code = 'A002'");
    expect(migration).not.toContain('insert into public.profiles');
  });
});
