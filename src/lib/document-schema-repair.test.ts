import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0069_document_request_submission_schema_repair.sql'), 'utf8');

describe('document request/submission schema repair migration', () => {
  it('restores document request and submission columns used by live upload workflows', () => {
    expect(migration).toContain('alter table public.document_requests');
    expect(migration).toContain('add column if not exists due_date date');
    expect(migration).toContain('add column if not exists reviewer_id uuid');
    expect(migration).toContain('add column if not exists reviewed_at timestamptz');
    expect(migration).toContain('alter table public.document_submissions');
    expect(migration).toContain('add column if not exists mime_type text');
    expect(migration).toContain('add column if not exists file_size bigint');
  });

  it('does not alter managed Supabase Storage tables', () => {
    expect(migration).not.toContain('storage.objects');
    expect(migration).not.toContain('create trigger');
  });
});
