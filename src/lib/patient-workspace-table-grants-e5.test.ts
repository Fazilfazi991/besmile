import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const grants = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260915104856_patient_workspace_table_grants_e5.sql'), 'utf8');
const patientPolicies = readFileSync(resolve(process.cwd(), 'supabase/migrations/0037_patient_records_and_documents.sql'), 'utf8');
const sessionPolicies = readFileSync(resolve(process.cwd(), 'supabase/migrations/0039_patient_profile_actions.sql'), 'utf8');
const rolePermissions = readFileSync(resolve(process.cwd(), 'supabase/migrations/0058_patient_batch2_scoped_access_fix.sql'), 'utf8');

describe('E5 assigned Psychologist workspace table grants', () => {
  it('enables PostgREST note/session reads and RLS-protected writes, plus read-only activity history', () => {
    expect(grants).toContain('grant select, insert, update on table public.patient_notes, public.patient_sessions to authenticated');
    expect(grants).toContain('grant select on table public.patient_activity_logs to authenticated');
    expect(grants).not.toMatch(/grant\s+(?:insert|update|delete)\s+on\s+table\s+public\.patient_activity_logs/i);
    expect(grants).not.toMatch(/grant\s+delete\s+on\s+table\s+public\.patient_(?:notes|sessions)/i);
  });

  it('keeps anonymous access revoked and leaves existing patient-scoped policies in force', () => {
    expect(grants).toContain('revoke all on table public.patient_notes, public.patient_sessions, public.patient_activity_logs from public, anon');
    expect(grants).not.toMatch(/grant\s+.*\s+to\s+(?:public|anon|service_role)/i);
    expect(patientPolicies).toContain('public.patient_access(patient_id)');
    expect(patientPolicies).toContain('public.has_permission(\'patient_activity.view\')');
    expect(patientPolicies).toContain('public.has_permission(\'clinical_notes.view\')');
    expect(sessionPolicies).toContain('public.has_permission(\'patient_sessions.create\')');
    expect(rolePermissions).toContain("'Psychologist', care_team_permissions || psychologist_extra");
    expect(rolePermissions).toContain("'patient_activity.view'");
  });
});
