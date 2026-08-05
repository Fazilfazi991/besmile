import { describe, expect, it } from 'vitest';
import { canChangeEmployeeStatus, canManageEmployee, isProtectedEmployeeRole, statusChangeValidation } from './employee-management-rules';

describe('employee management rules', () => {
  const gm = { id: 'gm', role: 'general_manager' };
  it('allows the GM to manage ordinary employee records but not protected accounts', () => {
    expect(canManageEmployee(gm, { id: 'staff', role: 'staff' })).toBe(true);
    expect(canManageEmployee(gm, { id: 'psychologist', role: 'staff' })).toBe(true);
    expect(canManageEmployee(gm, { id: 'admin', role: 'staff' })).toBe(true);
    expect(canManageEmployee(gm, { id: 'chair', role: 'chairman' })).toBe(false);
    expect(isProtectedEmployeeRole('super_admin')).toBe(true);
  });

  it('prevents self-deactivation and validates sensitive status reasons', () => {
    expect(canChangeEmployeeStatus(gm, gm)).toBe(false);
    expect(canChangeEmployeeStatus(gm, { id: 'staff', role: 'staff' })).toBe(true);
    expect(statusChangeValidation('inactive', '')).toContain('Provide a reason');
    expect(statusChangeValidation('on_leave', '')).toBe('');
    expect(statusChangeValidation('unknown', '')).toContain('valid employee status');
  });
});
