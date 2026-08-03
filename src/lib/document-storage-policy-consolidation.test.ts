import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0065_employee_document_storage_policy_consolidation.sql'), 'utf8');

describe('employee document storage policy consolidation migration', () => {
  it('configures the employee-documents bucket as private with explicit upload limits', () => {
    expect(migration).toContain("where id = 'employee-documents'");
    expect(migration).toContain('public = false');
    expect(migration).toContain('file_size_limit = 10485760');
    expect(migration).toContain('allowed_mime_types = array');
    expect(migration).toContain("'application/pdf'");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'image/png'");
    expect(migration).toContain("'image/webp'");
  });

  it('drops only obsolete employee-document insert policies before creating one guarded policy', () => {
    expect(migration).toContain('drop policy if exists "employee document uploads" on storage.objects');
    expect(migration).toContain('drop policy if exists "document uploads by owner or management" on storage.objects');
    expect(migration).toContain('drop policy if exists "employee documents guarded uploads" on storage.objects');
    expect(migration).toContain('create policy "employee documents guarded uploads"');
    expect(migration).toContain('for insert');
    expect(migration).not.toContain('drop policy if exists "document downloads for authorized records"');
    expect(migration).not.toContain("bucket_id = 'patient-documents'");
    expect(migration).not.toContain("bucket_id = 'sales-documents'");
  });

  it('enforces approved final extensions, MIME types, non-empty files and maximum size', () => {
    expect(migration).toContain("lower(coalesce(storage.extension(name), '')) in ('pdf', 'jpg', 'jpeg', 'png', 'webp')");
    expect(migration).toContain("lower(coalesce(metadata->>'mimetype', ''))");
    expect(migration).toContain("when coalesce(metadata->>'size', '') ~ '^[0-9]+$'");
    expect(migration).toContain("then (metadata->>'size')::bigint");
    expect(migration).toContain('else 0');
    expect(migration).toContain('between 1 and 10485760');
  });

  it('rejects dangerous extensions anywhere in the final filename', () => {
    for (const extension of ['exe', 'js', 'html?', 'svg', 'zip', 'bat', 'cmd', 'ps1']) {
      expect(migration).toContain(extension);
    }
    expect(migration).toContain("lower(storage.filename(name)) !~");
  });

  it('requires document managers to use their company namespace and employees to use their own namespace', () => {
    expect(migration).toContain("public.has_permission('documents.manage')");
    expect(migration).toContain("public.has_permission('documents.employee.manage')");
    expect(migration).toContain("(storage.foldername(name))[1] = 'company'");
    expect(migration).toContain('(storage.foldername(name))[2] = auth.uid()::text');
    expect(migration).toContain('owner_id = auth.uid()::text');
    expect(migration).toContain('(storage.foldername(name))[1] = auth.uid()::text');
  });

  it('does not create employee-document update or delete policies that could enable overwrite bypasses', () => {
    expect(migration).not.toContain('for update');
    expect(migration).not.toContain('for delete');
    expect(migration).not.toContain('for all');
    expect(migration).not.toContain('upsert');
  });
});
