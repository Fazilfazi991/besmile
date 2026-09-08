import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260815150000_patient_document_upload_contract.sql', import.meta.url),
  'utf8',
);

describe('patient document upload contract', () => {
  it('removes the permissive legacy insert policy and binds rows to the caller', () => {
    expect(migration).toContain('drop policy if exists "patient documents write" on public.patient_documents');
    expect(migration).toContain('uploaded_by = (select auth.uid())');
    expect(migration).toContain("public.patient_access(patient_id)");
    expect(migration).toContain("public.has_permission('patient_documents.upload')");
  });

  it('allows only the server two-step pending key or the canonical document key', () => {
    expect(migration).toContain("storage_key ~ '^pending-");
    expect(migration).toContain("'^patients/' || patient_id::text || '/documents/' || id::text");
    expect(migration).toContain('drop policy if exists "patient documents upload finalize"');
  });

  it('replaces arbitrary storage writes with an owner-bound, patient-scoped path policy', () => {
    expect(migration).toContain('drop policy if exists "patient storage upload" on storage.objects');
    expect(migration).toContain('create policy "patient storage canonical upload"');
    expect(migration).toContain('for insert\nto authenticated');
    expect(migration).toContain("name ~* '^patients/");
    expect(migration).toContain("split_part(name, '/', 2)::uuid");
    expect(migration).toContain('public.patient_access(');
  });
});


