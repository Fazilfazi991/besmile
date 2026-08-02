import { describe, expect, it } from 'vitest';
import { employeeSalarySettingsSelect, payrollLoadError } from './payroll-query';

describe('payroll salary-settings query', () => {
  it('uses the employee profile foreign key instead of the updated-by audit relationship', () => {
    expect(employeeSalarySettingsSelect).toContain('employee:profiles!employee_salary_settings_profile_id_fkey');
    expect(employeeSalarySettingsSelect).not.toContain('employee_salary_settings_updated_by_fkey');
  });

  it('uses a safe user-facing load error', () => {
    expect(payrollLoadError).not.toMatch(/relationship|employee_salary_settings|profiles/i);
  });
});
