import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CRM lead permission architecture', () => {
  it('uses effective permissions and authenticated identity, never a named account', () => {
    const migration = readFileSync('supabase/migrations/20260815120000_critical_rpc_and_salary_setting_hardening.sql', 'utf8');
    expect(migration).toContain("public.has_permission('leads.create')");
    expect(migration).toContain('new.created_by := auth.uid()');
    expect(migration).toContain("public.has_permission('leads.assign')");
    expect(migration).not.toMatch(/internbsmile|auth\.email\(\)|user_permission_grants\(profile_id, permission_id, reason\)/i);
  });
});
