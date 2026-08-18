import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync(resolve(process.cwd(), 'src/components/patient-workspace.tsx'), 'utf8');
const route = readFileSync(resolve(process.cwd(), 'src/app/api/patients/[patientId]/manage/route.ts'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260818170000_add_safe_client_delete.sql'), 'utf8');

describe('client detail deletion flow', () => {
  it('renders an accessible More actions menu and destructive confirmation', () => {
    expect(workspace).toContain('aria-haspopup="menu"');
    expect(workspace).toContain('role="menu"');
    expect(workspace).toContain('Delete Client');
    expect(workspace).toContain('Delete client?');
    expect(workspace).toContain('Client deleted successfully');
  });

  it('uses the authorized server route and redirects to the client list after success', () => {
    expect(workspace).toContain("kind: 'delete'");
    expect(workspace).toContain('router.replace(`${basePath}?deleted=1`)');
    expect(workspace).toContain("perms['patients.delete']");
    expect(route).toContain("allowed(db,'patients.delete')");
    expect(route).toContain("db.rpc('delete_client'");
    expect(route).toContain("status: 403");
  });

  it('blocks restrictive dependencies and preserves the canonical delete audit', () => {
    for (const table of ['doctor_appointments', 'patient_sessions', 'patient_documents', 'patient_notes', 'crm_leads']) expect(migration).toContain(`public.${table}`);
    expect(migration).toContain("delete from public.patient_activity_logs");
    expect(migration).toContain("delete from public.patients");
    expect(migration).toContain("public.has_permission('patients.delete')");
    expect(migration).not.toContain('delete from public.audit_logs');
  });

  it('uses Client terminology in the detail action controls', () => {
    expect(workspace).not.toContain("'Edit patient'");
    expect(workspace).not.toContain("'Save patient'");
    expect(workspace).toContain("'Edit Client'");
    expect(workspace).toContain("'Save Client'");
  });
});
