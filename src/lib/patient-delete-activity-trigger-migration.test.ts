import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260815160000_fix_patient_delete_activity_trigger.sql'),
  'utf8',
);

describe('patient delete activity trigger repair', () => {
  it('keeps the existing trigger function security-scoped', () => {
    expect(migration).toContain('create or replace function public.patient_activity_event()');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public');
  });

  it('keeps patient create and update activity in the patient-child activity log', () => {
    expect(migration).toContain("case when tg_op = 'INSERT' then 'patient_created' else 'patient_updated' end");
    expect(migration).toContain("'patient',");
    expect(migration).toContain('new.id,');
  });

  it('writes patient deletion auditing to the canonical audit log, not a child activity row', () => {
    const deleteBranch = migration.split("if tg_op = 'DELETE' then")[1].split('end if;')[0];
    expect(deleteBranch).toContain('insert into public.audit_logs');
    expect(deleteBranch).toContain("'patient_deleted'");
    expect(deleteBranch).toContain('old.id');
    expect(deleteBranch).not.toContain('patient_activity_logs');
  });

  it('does not weaken the patient activity foreign key or alter the trigger definition', () => {
    expect(migration).not.toContain('drop constraint');
    expect(migration).not.toContain('disable trigger');
    expect(migration).not.toContain('drop trigger');
  });
});
