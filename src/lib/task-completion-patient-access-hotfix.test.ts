import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260917090000_task_completion_patient_access_hotfix.sql', import.meta.url), 'utf8');

describe('task completion and Psychologist patient access hotfix', () => {
  it('updates the persisted parent task after the canonical completion RPC', () => {
    expect(migration).toContain('create or replace function public.complete_task_assignment');
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain('completed_at = coalesce(completed_at, now())');
    expect(migration).toContain('where task_id = assignment.task_id and status <> \'completed\'');
    expect(migration).toContain('grant execute on function public.complete_task_assignment(uuid, text) to authenticated');
  });

  it('adds patient workspace capabilities without replacing existing Psychologist permissions', () => {
    for (const code of [
      'patient_documents.view', 'patient_documents.upload', 'patient_documents.download',
      'patient_notes.view', 'patient_notes.create', 'patient_notes.edit',
      'clinical_notes.view', 'clinical_notes.create', 'clinical_notes.edit',
    ]) expect(migration).toContain(`'${code}'`);
    expect(migration).toContain('on conflict do nothing');
    expect(migration).not.toMatch(/delete\s+from\s+public\.(role_permissions|designation_permission_bundle_permissions)/i);
    expect(migration).not.toMatch(/grant\s+all/i);
    expect(migration).not.toMatch(/disable\s+row level security/i);
  });
});
