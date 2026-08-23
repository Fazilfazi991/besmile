import { describe, expect, it } from 'vitest';
import { validateSalarySetting } from './salary-setting-rules';

describe('validateSalarySetting', () => {
  it('rejects a blank salary setting without coercing fields to zero', () => {
    const result = validateSalarySetting({});
    expect(result.errors).toMatchObject({ profile_id: 'Select an employee.', effective_date: 'Select an effective date.', basic_salary: expect.any(String) });
  });
  it('permits explicit zero allowances and deductions but requires positive basic pay', () => {
    expect(validateSalarySetting({ profile_id: 'employee', effective_date: '2026-08-15', basic_salary: '1', default_allowances: '0', default_deductions: '0' }).errors).toEqual({});
  });
});
