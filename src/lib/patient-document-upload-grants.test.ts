import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('patient document Data API grants', () => {
  for (const [file, privilege] of [
    ['20260910061758_grant_patient_document_upload_insert.sql', 'insert'],
    ['20260910062130_grant_patient_document_upload_finalize.sql', 'update'],
  ]) it(`exposes only ${privilege}, without changing RLS or anonymous access`, () => {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/--[^\n]*/g, '').trim();
    expect(sql).toBe(`grant ${privilege} on table public.patient_documents to authenticated;`);
  });
  it('preserves patient, uploader and upload-permission checks in canonical INSERT RLS', () => {
    const sql = readFileSync('supabase/migrations/0037_patient_records_and_documents.sql', 'utf8');
    expect(sql).toContain("public.patient_access(patient_id) and public.has_permission('patient_documents.upload')");
  });
});
