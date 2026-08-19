import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819120000_assistant_manager_crm_management_access.sql'),
  'utf8',
);

describe('Assistant Manager CRM management access migration', () => {
  it('uses the existing CRM management and shell permissions through the designation mapping', () => {
    expect(migration).toContain("permission.code in ('admin.shell', 'crm.manage_all')");
    expect(migration).toContain("assistant.role::text = 'staff'");
    expect(migration).toContain("assistant.designation = 'Assistant Manager'");
    expect(migration).toContain("assistant.status::text in ('active', 'intern', 'probation')");
  });

  it('does not grant unrelated administrative capabilities or hardcode a person', () => {
    for (const forbidden of ['finance.', 'payroll', 'employees.', 'system_settings', 'Diya', 'Anthikat']) {
      expect(migration).not.toContain(forbidden);
    }
  });
});
