import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canUseGenie } from './genie-access';

describe('Genie internal access boundary', () => {
  it('allows active internal employees, including legacy null employee flags', () => {
    expect(canUseGenie({ status: 'active', is_employee: true })).toBe(true);
    expect(canUseGenie({ status: 'active', is_employee: null })).toBe(true);
  });

  it('rejects outsourced, inactive, terminated, and missing profiles', () => {
    expect(canUseGenie({ status: 'active', is_employee: false })).toBe(false);
    expect(canUseGenie({ status: 'inactive', is_employee: true })).toBe(false);
    expect(canUseGenie({ status: 'terminated', is_employee: true })).toBe(false);
    expect(canUseGenie(null)).toBe(false);
  });

  it('keeps the API data surface limited to session, minimal profile access, and policy retrieval', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/genie/route.ts'), 'utf8');
    expect(route).toContain(".from('profiles')");
    expect(route).toContain(".select('status,is_employee')");
    expect(route).not.toMatch(/patients|leads|finance|payroll|employee_repository|private_profile/i);
    expect(route).toContain("'Cache-Control': 'private, no-store, max-age=0'");
  });
});
