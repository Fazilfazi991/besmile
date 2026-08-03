import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0064_employee_document_storage_upload_guard.sql'), 'utf8');

describe('employee document storage upload guard migration', () => {
  it('replaces legacy employee document upload policies', () => {
    expect(migration).toContain('drop policy if exists "employee document uploads"');
    expect(migration).toContain('drop policy if exists "document uploads by owner or management"');
    expect(migration).toContain('create policy "document uploads by owner or management"');
  });

  it('requires authorized owner or document-management permission', () => {
    expect(migration).toContain("public.has_permission('documents.manage')");
    expect(migration).toContain("public.has_permission('documents.employee.manage')");
    expect(migration).toContain('owner_id = auth.uid()::text');
    expect(migration).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });

  it('enforces the document file allowlist and size limit in storage RLS', () => {
    expect(migration).toContain("metadata->>'size'");
    expect(migration).toContain('10485760');
    expect(migration).toContain("'application/pdf'");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'image/png'");
    expect(migration).toContain("'image/webp'");
    expect(migration).toContain("metadata->>'mimetype'");
  });
});
