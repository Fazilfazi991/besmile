import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const createEmployeeAction = readFileSync(resolve(process.cwd(), 'src/app/admin/employees/new/actions.ts'), 'utf8');
const passwordRoute = readFileSync(resolve(process.cwd(), 'src/app/api/auth/change-password/route.ts'), 'utf8');
const middleware = readFileSync(resolve(process.cwd(), 'src/middleware.ts'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260815110000_employee_password_onboarding.sql'), 'utf8');

describe('employee auth onboarding', () => {
  it('creates confirmed server-side accounts with a first-login password change', () => {
    expect(createEmployeeAction).toContain('admin.auth.admin.createUser');
    expect(createEmployeeAction).toContain('email_confirm: true');
    expect(createEmployeeAction).toContain('must_change_password: true');
    expect(createEmployeeAction).toContain('admin.auth.admin.deleteUser(account.user.id)');
    expect(createEmployeeAction).not.toContain('inviteUserByEmail');
  });

  it('verifies the current password and clears the first-login flag only server-side', () => {
    expect(passwordRoute).toContain('signInWithPassword');
    expect(passwordRoute).toContain('session.auth.updateUser({ password: newPassword })');
    expect(passwordRoute).toContain("update({ must_change_password: false })");
    expect(passwordRoute).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(migration).toContain('new.must_change_password is distinct from old.must_change_password');
  });

  it('redirects first-login accounts before any normal workspace route', () => {
    expect(middleware).toContain("profile.must_change_password && path !== '/change-password'");
    expect(middleware).toContain("'/change-password'");
  });

  it('does not place password fields into profile or audit records', () => {
    expect(createEmployeeAction).not.toContain('temporary_password:');
    expect(createEmployeeAction).not.toContain('password: temporaryPassword,\n    status');
    expect(createEmployeeAction).not.toContain('after_data: { role, temporaryPassword');
  });
});
