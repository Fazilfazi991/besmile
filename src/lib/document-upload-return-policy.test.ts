import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0066_employee_document_upload_return_policy.sql'), 'utf8');

describe('employee document upload return policy migration', () => {
  it('adds a separate select policy without replacing authorized document downloads', () => {
    expect(migration).toContain('create policy "employee document upload return access"');
    expect(migration).toContain('for select');
    expect(migration).not.toContain('drop policy if exists "document downloads for authorized records"');
    expect(migration).not.toContain('create policy "document downloads for authorized records"');
  });

  it('limits upload-return reads to the employee-documents bucket and authenticated owner', () => {
    expect(migration).toContain("bucket_id = 'employee-documents'");
    expect(migration).toContain('owner_id = auth.uid()::text');
    expect(migration).not.toContain("bucket_id = 'patient-documents'");
    expect(migration).not.toContain("bucket_id = 'sales-documents'");
  });

  it('excludes Storage list operations while allowing narrow object metadata return/read', () => {
    expect(migration).toContain("not storage.allow_only_operation('object.list')");
    expect(migration).not.toContain("storage.allow_only_operation('object.list')\n      and");
  });

  it('matches the guarded insert path model for management company uploads', () => {
    expect(migration).toContain("public.has_permission('documents.manage')");
    expect(migration).toContain("public.has_permission('documents.employee.manage')");
    expect(migration).toContain("(storage.foldername(name))[1] = 'company'");
    expect(migration).toContain('(storage.foldername(name))[2] = auth.uid()::text');
  });

  it('matches the guarded insert path model for employee own-uid uploads', () => {
    expect(migration).toContain('(storage.foldername(name))[1] = auth.uid()::text');
  });

  it('does not add update, delete, insert, or all privileges for overwrite bypasses', () => {
    expect(migration).not.toContain('for update');
    expect(migration).not.toContain('for delete');
    expect(migration).not.toContain('for insert');
    expect(migration).not.toContain('for all');
  });
});
