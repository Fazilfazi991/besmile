import { describe, expect, it } from 'vitest';
import { canChangeEmployeeStatus, canManageEmployee, canRemoveEmployee, canRestoreEmployee, isProtectedEmployeeRole, removalReasonText, removalReasonValidation, statusChangeValidation } from './employee-management-rules';
import { employeeStatuses, isOperationalEmployeeStatus, isPayrollEligibleEmployeeStatus } from './employee-status';

describe('employee management rules', () => {
  const gm = { id: 'gm', role: 'general_manager' };
  it('allows the GM to manage ordinary employee records but not protected accounts', () => {
    expect(canManageEmployee(gm, { id: 'staff', role: 'staff' })).toBe(true);
    expect(canManageEmployee(gm, { id: 'psychologist', role: 'staff' })).toBe(true);
    expect(canManageEmployee(gm, { id: 'admin', role: 'staff' })).toBe(true);
    expect(canManageEmployee(gm, { id: 'chair', role: 'chairman' })).toBe(false);
    expect(isProtectedEmployeeRole('super_admin')).toBe(true);
  });

  it('allows authorized management roles to remove ordinary employees, but never staff, self, or protected accounts', () => {
    const target = { id: 'staff', role: 'staff', status: 'active' };
    for (const role of ['chairman', 'director', 'general_manager', 'super_admin']) {
      expect(canRemoveEmployee({ id: role, role }, target)).toBe(true);
    }
    expect(canRemoveEmployee({ id: 'ordinary', role: 'staff' }, target)).toBe(false);
    expect(canRemoveEmployee({ id: 'staff', role: 'general_manager' }, target)).toBe(false);
    expect(canRemoveEmployee(gm, { id: 'chair', role: 'chairman', status: 'active' })).toBe(false);
    expect(canRemoveEmployee(gm, { ...target, status: 'inactive' })).toBe(false);
  });

  it('validates removal reasons and only restores administratively removed employees', () => {
    expect(removalReasonValidation('', '')).toContain('Choose a reason');
    expect(removalReasonValidation('Other', '')).toContain('Provide the removal reason');
    expect(removalReasonValidation('Resigned', '')).toBe('');
    expect(removalReasonText('Duplicate account', 'Same email')).toBe('Duplicate account: Same email');
    expect(canRestoreEmployee(gm, { id: 'staff', role: 'staff', status: 'inactive', removed_at: '2026-08-11T00:00:00Z' })).toBe(true);
    expect(canRestoreEmployee(gm, { id: 'staff', role: 'staff', status: 'resigned', removed_at: null })).toBe(false);
  });

  it('prevents self-deactivation and validates sensitive status reasons', () => {
    expect(canChangeEmployeeStatus(gm, gm)).toBe(false);
    expect(canChangeEmployeeStatus(gm, { id: 'staff', role: 'staff' })).toBe(true);
    expect(statusChangeValidation('inactive', '')).toContain('Provide a reason');
    expect(statusChangeValidation('on_leave', '')).toBe('');
    expect(statusChangeValidation('resigned', '')).toContain('Provide a reason');
    expect(statusChangeValidation('unknown', '')).toContain('valid employee status');
  });

  it('uses canonical lifecycle and explicit eligibility rules', () => {
    expect(employeeStatuses).toEqual(['active', 'inactive', 'on_leave', 'intern', 'probation', 'resigned', 'terminated']);
    expect(isOperationalEmployeeStatus('active')).toBe(true);
    expect(isOperationalEmployeeStatus('intern')).toBe(true);
    expect(isOperationalEmployeeStatus('probation')).toBe(true);
    expect(isOperationalEmployeeStatus('on_leave')).toBe(false);
    expect(isOperationalEmployeeStatus('resigned')).toBe(false);
    expect(isPayrollEligibleEmployeeStatus('active')).toBe(true);
    expect(isPayrollEligibleEmployeeStatus('intern')).toBe(false);
    expect(isPayrollEligibleEmployeeStatus('probation')).toBe(false);
    expect(isPayrollEligibleEmployeeStatus('resigned')).toBe(false);
  });
});
