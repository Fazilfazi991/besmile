import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canUseGenie } from './genie-access';
import { adminRouteRequirement, permissionAllows } from './permission-access';

describe('Genie internal access boundary', () => {
  it('allows normal active employees and legitimate internal workspace roles', () => {
    expect(canUseGenie({ status: 'active', is_employee: true, role: 'staff' })).toBe(true);
    expect(canUseGenie({ status: 'active', is_employee: null, role: 'staff' })).toBe(true);
    expect(canUseGenie({ status: 'active', is_employee: false, role: 'super_admin' })).toBe(true);
    expect(canUseGenie({ status: 'active', is_employee: false, role: 'director' })).toBe(true);
    expect(canUseGenie({ status: 'active', is_employee: false, role: 'chairman' })).toBe(true);
    expect(canUseGenie({ status: 'active', is_employee: false, role: 'general_manager' })).toBe(true);
  });

  it('rejects outsourced/external, inactive, terminated, and missing profiles', () => {
    expect(canUseGenie({ status: 'active', is_employee: false, role: 'psychologist' })).toBe(false);
    expect(canUseGenie({ status: 'active', is_employee: false, role: 'guest_sales' })).toBe(false);
    expect(canUseGenie({ status: 'active', is_employee: null, role: null })).toBe(false);
    expect(canUseGenie({ status: 'inactive', is_employee: true, role: 'staff' })).toBe(false);
    expect(canUseGenie({ status: 'terminated', is_employee: true, role: 'super_admin' })).toBe(false);
    expect(canUseGenie(null)).toBe(false);
  });

  it('allows the Genie route through the existing admin workspace boundary without a second module permission', () => {
    expect(adminRouteRequirement('/admin/genie')).toBeUndefined();
    expect(permissionAllows(new Set(), adminRouteRequirement('/admin/genie'))).toBe(true);
  });

  it('keeps the API data surface permission-scoped for policy and approved workflows', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/genie/route.ts'), 'utf8');
    expect(route).toContain(".from('profiles')");
    expect(route).toContain(".select('id,status,is_employee,role,onboarding_required')");
    expect(route).toContain("rpc('confirm_genie_action'");
    expect(route).not.toMatch(/from\(['"](?:patients|payroll|employee_salary_settings)/i);
    expect(route).toContain("'Cache-Control': 'private, no-store, max-age=0'");
  });
});
