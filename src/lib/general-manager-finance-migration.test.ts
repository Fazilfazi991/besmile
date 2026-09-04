import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260808182000_general_manager_finance_manage.sql',
  'utf8',
);

describe('General Manager finance permission migration', () => {
  it('supports both canonical and legacy role permission schemas', () => {
    expect(migration).toContain("column_name = 'role_id'");
    expect(migration).toContain('insert into public.role_permissions(role_id, permission_id)');
    expect(migration).toContain("column_name = 'role'");
    expect(migration).toContain('insert into public.role_permissions(role, permission_id)');
    expect(migration).toContain("permission.code = 'finance.manage'");
    expect(migration).toContain("role.code = 'general_manager'");
  });
});
