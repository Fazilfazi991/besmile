import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0068_document_notification_overload_fix.sql'), 'utf8');

describe('document notification overload repair migration', () => {
  it('replaces only the document notification trigger function', () => {
    expect(migration).toContain('create or replace function public.notify_document_event()');
    expect(migration).not.toContain('create trigger');
    expect(migration).not.toContain('storage.objects');
  });

  it('disambiguates notify_user calls with typed text arguments and document metadata', () => {
    expect(migration.match(/perform public.notify_user/g)).toHaveLength(3);
    expect(migration).toContain("'Document requested'::text");
    expect(migration).toContain("'document_requested'::text");
    expect(migration).toContain("('document_' || new.status)::text");
    expect(migration).toContain("'document_submitted'::text");
    expect(migration).toContain("'documents'::text");
    expect(migration).toContain("'normal'::text");
  });
});
