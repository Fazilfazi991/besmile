import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0070_document_notification_table_branch_fix.sql'), 'utf8');

describe('document notification trigger table branching', () => {
  it('branches by table before evaluating request-only status fields', () => {
    const requestBranch = migration.indexOf("if TG_TABLE_NAME = 'document_requests' then");
    const submissionBranch = migration.indexOf("elsif TG_TABLE_NAME = 'document_submissions' then");
    const statusCheck = migration.indexOf('elsif new.status is distinct from old.status');

    expect(requestBranch).toBeGreaterThan(-1);
    expect(submissionBranch).toBeGreaterThan(requestBranch);
    expect(statusCheck).toBeGreaterThan(requestBranch);
    expect(statusCheck).toBeLessThan(submissionBranch);
  });

  it('keeps the overload-disambiguated document notification calls', () => {
    expect(migration.match(/perform public.notify_user/g)).toHaveLength(3);
    expect(migration).toContain("'Document requested'::text");
    expect(migration).toContain("'document_submitted'::text");
    expect(migration).toContain("'documents'::text");
    expect(migration).not.toContain('storage.objects');
  });
});
