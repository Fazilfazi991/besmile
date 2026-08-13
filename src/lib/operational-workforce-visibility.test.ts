import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260813074500_workforce_operational_visibility.sql');

describe('operational workforce visibility', () => {
  it('preserves hidden profiles and their history instead of deleting identities', () => {
    expect(migration).toContain('add column if not exists workforce_visible boolean not null default true');
    expect(migration).toContain('set workforce_visible = false');
    expect(migration).toContain("'%@qa.bsmile.local'");
    expect(migration).toContain("'%@bsmile.test'");
    expect(migration).toContain("'aiswarya.p@bsmile.local'");
    expect(migration).toContain("'diya.anthikat@bsmile.local'");
    expect(migration).toContain("'fusionventureworks@gmail.com'");
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
  });

  it('excludes hidden profiles from server-side payroll generation', () => {
    expect(migration).toContain('and profile.workforce_visible');
    expect(migration).toContain("and profile.status = 'active'");
    expect(migration).toContain("public.has_permission('payroll.manage')");
  });

  it('allows employees to remove only superseded objects in their own document folder', () => {
    expect(migration).toContain('create policy "document object owners delete"');
    expect(migration).toContain("bucket_id = 'employee-documents'");
    expect(migration).toContain('owner_id = (select auth.uid())::text');
    expect(migration).toContain('(storage.foldername(name))[1] = (select auth.uid())::text');
  });

  it('allows a rejected document submission to update only after its owner resubmits the request', () => {
    expect(migration).toContain('create policy "document submissions owner correction"');
    expect(migration).toContain('on public.document_submissions for update to authenticated');
    expect(migration).toContain('submitted_by = (select auth.uid())');
    expect(migration).toContain("request.status = 'submitted'");
    expect(migration).toContain('with check');
  });

  it.each([
    'src/lib/admin-repository.ts',
    'src/lib/calendar-meeting-repository.ts',
    'src/lib/employee-repository.ts',
    'src/components/patient-workspace.tsx',
    'src/components/patient-ui.tsx',
    'src/lib/idea-repository.ts',
    'src/components/operational-reports.tsx',
    'src/app/admin/employees/new/page.tsx',
  ])('applies visibility to operational selectors in %s', path => {
    expect(read(path)).toContain('workforce_visible');
  });

  it('keeps hidden QA/vendor profiles out of the default employee directory view', () => {
    const page = readFileSync('src/app/admin/employees/page.tsx', 'utf8');
    expect(page).toContain('employee.workforce_visible !== false');
    expect(page).toContain('employee.workforce_visible === false');
  });
});
