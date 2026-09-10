import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adminRouteRequirement, employeeRouteRequirement, permissionAllows } from './permission-access';

describe('Assistant Manager patient access', () => {
  it('accepts existing view-all permission at patient routes without granting management', () => {
    const permissions = new Set(['patients.view_all']);
    expect(permissionAllows(permissions, employeeRouteRequirement('/employee/patients'))).toBe(true);
    expect(permissionAllows(permissions, employeeRouteRequirement('/employee/patients/example'))).toBe(true);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/patients/example'))).toBe(true);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/documents'))).toBe(false);
    expect(permissionAllows(new Set(), employeeRouteRequirement('/employee/patients/example'))).toBe(false);
  });

  it('grants only existing patient document read permissions through canonical designation scope', () => {
    const sql = readFileSync('supabase/migrations/20260910051941_assistant_manager_patient_document_read.sql', 'utf8');
    expect(sql).toContain("('patient_documents.view', 'patient_documents.download')");
    expect(sql).toContain("assistant.role::text = 'staff'");
    expect(sql).toContain("assistant.designation = 'Assistant Manager'");
    expect(sql).not.toMatch(/create\s+policy|alter\s+table|grant\s+all|@|documents\.manage/i);
  });
});
