import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260815130000_crm_lead_creator_read_scope.sql', import.meta.url),
  'utf8',
);
const identityHardening = readFileSync(
  new URL('../../supabase/migrations/20260815120000_critical_rpc_and_salary_setting_hardening.sql', import.meta.url),
  'utf8',
);
const permissionHelper = readFileSync(
  new URL('../../supabase/migrations/0017_task_assignment_permissions.sql', import.meta.url),
  'utf8',
);
const leadSchema = readFileSync(
  new URL('../../supabase/migrations/0013_leads_sales_crm.sql', import.meta.url),
  'utf8',
);
const employeeRepository = readFileSync(new URL('./employee-repository.ts', import.meta.url), 'utf8');

describe('CRM lead creator return scope', () => {
  it('allows a permitted creator to read only the self-assigned lead needed by INSERT ... RETURNING', () => {
    expect(migration).toContain('public.crm_lead_can_view(assigned_to, converted_patient_id)');
    expect(migration).toContain('created_by = auth.uid()');
    expect(migration).toContain('assigned_to = auth.uid()');
    expect(migration).toContain("public.has_permission('leads.create')");
  });

  it('keeps creator and assignee identity server-owned before RLS evaluates the returned row', () => {
    expect(identityHardening).toContain('new.created_by := auth.uid()');
    expect(identityHardening).toContain('new.assigned_to := coalesce(new.assigned_to, auth.uid())');
    expect(identityHardening).toContain("public.has_permission('leads.assign')");
    expect(identityHardening).toContain("public.has_permission('crm.manage_all')");
  });

  it('uses the auth-user/profile ID domain and requires an active profile for effective permissions', () => {
    expect(leadSchema).toContain('assigned_to uuid references public.profiles(id)');
    expect(leadSchema).toContain('created_by uuid references public.profiles(id)');
    expect(permissionHelper).toContain("subject.id=subject_id and subject.status='active'");
  });

  it('uses INSERT ... RETURNING in the employee repository, exercising the read policy in the real client path', () => {
    expect(employeeRepository).toContain('.from("crm_leads")');
    expect(employeeRepository).toContain('.insert(payload)');
    expect(employeeRepository).toContain('.select()');
    expect(employeeRepository).toContain('.single()');
  });
});
