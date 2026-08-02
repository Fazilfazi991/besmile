import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/0062_document_schema_and_storage_scope.sql', import.meta.url), 'utf8');

describe('document center schema and storage policy migration', () => {
  it('restores metadata columns used by the admin document upload form', () => {
    expect(migration).toContain('add column if not exists description text');
    expect(migration).toContain('add column if not exists file_name text');
    expect(migration).toContain('add column if not exists mime_type text');
    expect(migration).toContain('add column if not exists file_size bigint');
  });

  it('requires company-document storage reads to pass document share access', () => {
    expect(migration).toContain('create or replace function public.company_document_can_read');
    expect(migration).toContain('public.company_document_can_read(document.id)');
    expect(migration).toContain('share.shared_with_all or share.profile_id = auth.uid()');
  });
});
