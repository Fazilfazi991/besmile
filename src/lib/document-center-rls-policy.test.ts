import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0063_document_center_rls_policy_repair.sql', import.meta.url), 'utf8');

describe('document center RLS policy repair migration', () => {
  it('removes the broad legacy employee-document storage policy', () => {
    expect(migration).toContain('drop policy if exists "employee document downloads" on storage.objects');
  });

  it('requires company document table and storage reads to pass explicit shares or document management permissions', () => {
    expect(migration).toContain('shared_with_all or share.profile_id = auth.uid()');
    expect(migration).toContain("public.has_permission('documents.manage')");
    expect(migration).toContain("public.has_permission('documents.employee.manage')");
    expect(migration).toContain('where document.storage_path = name');
  });
});
