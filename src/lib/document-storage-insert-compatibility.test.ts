import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0067_employee_document_storage_insert_compatibility.sql'), 'utf8');
const createPolicy = migration.slice(migration.indexOf('create policy "employee documents guarded uploads"'));

describe('employee document storage insert compatibility migration', () => {
  it('keeps the bucket private with declared MIME and size restrictions', () => {
    expect(migration).toContain("where id = 'employee-documents'");
    expect(migration).toContain('public = false');
    expect(migration).toContain('file_size_limit = 10485760');
    expect(migration).toContain('allowed_mime_types = array');
    expect(migration).toContain("'application/pdf'");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'image/png'");
    expect(migration).toContain("'image/webp'");
  });

  it('replaces only the guarded employee document insert policy', () => {
    expect(migration).toContain('drop policy if exists "employee documents guarded uploads" on storage.objects');
    expect(migration).toContain('create policy "employee documents guarded uploads"');
    expect(migration).toContain('for insert');
    expect(migration).not.toContain('drop policy if exists "document downloads for authorized records"');
    expect(migration).not.toContain('drop policy if exists "employee document upload return access"');
  });

  it('does not depend on storage metadata in the INSERT RLS policy', () => {
    expect(createPolicy).not.toContain("metadata->>'mimetype'");
    expect(createPolicy).not.toContain("metadata ->> 'mimetype'");
    expect(createPolicy).not.toContain("metadata->>'size'");
    expect(createPolicy).not.toContain("metadata ->> 'size'");
    expect(createPolicy).not.toContain('::bigint');
  });

  it('still enforces approved final extension and rejects dangerous embedded extensions', () => {
    expect(createPolicy).toContain("lower(coalesce(storage.extension(name), ''))");
    expect(createPolicy).toContain("in ('pdf', 'jpg', 'jpeg', 'png', 'webp')");
    expect(createPolicy).toContain("storage.filename(name) !~ '[<>:\"\\\\|?*]'");
    expect(createPolicy).toContain('lower(storage.filename(name))');
    for (const extension of ['exe', 'js', 'html?', 'svg', 'zip', 'bat', 'cmd', 'ps1']) {
      expect(createPolicy).toContain(extension);
    }
  });

  it('requires authenticated ownership and the intended namespace model', () => {
    expect(createPolicy).toContain('owner_id = auth.uid()::text');
    expect(createPolicy).toContain("public.has_permission('documents.manage')");
    expect(createPolicy).toContain("public.has_permission('documents.employee.manage')");
    expect(createPolicy).toContain("(storage.foldername(name))[1] = 'company'");
    expect(createPolicy).toContain('(storage.foldername(name))[2] = auth.uid()::text');
    expect(createPolicy).toContain('(storage.foldername(name))[1] = auth.uid()::text');
  });

  it('creates no update/delete/all storage policy for overwrite bypasses', () => {
    expect(migration).not.toContain('for update');
    expect(migration).not.toContain('for delete');
    expect(migration).not.toContain('for all');
  });
});
