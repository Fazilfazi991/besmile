import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('General Manager CRM operation permissions', () => {
  it('grants the permissions used by atomic client conversion and CRM import', () => {
    const sql = readFileSync('supabase/migrations/20260813080700_general_manager_crm_conversion_import.sql', 'utf8');
    expect(sql).toContain("'crm.manage_all', 'crm.import'");
    expect(sql).toContain("'General Manager'::public.employee_role");
    expect(sql).toContain("role.code = 'general_manager'");
    expect(sql).toContain("using (public.has_permission('crm.import'))");
    expect(sql).toContain('crm_import_batches');
    expect(sql).toContain('crm_import_rows');
  });
});
