import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = readFileSync(new URL('../app/admin/employees/new/form.tsx', import.meta.url), 'utf8');
const action = readFileSync(new URL('../app/admin/employees/new/actions.ts', import.meta.url), 'utf8');

describe('employee create validation', () => {
  it('requires designation in the browser and on the server action', () => {
    expect(form).toContain('<Field label="Designation" required>');
    expect(form).toContain('<input name="designation" className="input" required />');
    expect(action).toContain('const designation = String(form.get');
    expect(action).toContain('department, designation, and a valid operational role are required.');
  });

  it('normalizes joining dates before employee invitation/profile creation', () => {
    expect(action).toContain("import { normalizeDateOnly } from '@/lib/employee-edit-rules'");
    expect(action).toContain('normalizeDateOnly(rawJoiningDate)');
    expect(action.indexOf('normalizeDateOnly(rawJoiningDate)')).toBeLessThan(action.indexOf('inviteUserByEmail(email)'));
    expect(action).toContain('Joining date must be a valid calendar date.');
  });
});
