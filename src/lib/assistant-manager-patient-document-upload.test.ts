import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260919133000_assistant_manager_patient_document_upload.sql',
  'utf8',
);

describe('Assistant Manager patient document upload access', () => {
  it('adds only the upload capability to the canonical designation bundle', () => {
    expect(migration).toContain("permission.code = 'patient_documents.upload'");
    expect(migration).toContain("bundle.department_name = 'Administration'");
    expect(migration).toContain("bundle.designation = 'Assistant Manager'");
    expect(migration).toContain('on conflict do nothing');
  });

  it('does not weaken patient, document, or Storage security', () => {
    expect(migration).not.toMatch(/create\s+policy|drop\s+policy|alter\s+table/i);
    expect(migration).not.toMatch(/grant\s+all|disable\s+row\s+level\s+security/i);
    expect(migration).not.toMatch(/service_role|@|aiswarya|diya/i);
    expect(migration).not.toContain('patient_documents.archive');
    expect(migration).not.toContain('patient_documents.delete');
    expect(migration).not.toContain('patient_documents.replace');
  });
});
