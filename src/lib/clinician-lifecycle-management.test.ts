import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clinicianLifecycleError } from './clinician-lifecycle';

const migration = readFileSync(new URL('../../supabase/migrations/20260818130813_clinician_lifecycle_management.sql', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./doctor-scheduling-repository.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../components/doctor-scheduling.tsx', import.meta.url), 'utf8');

describe('clinician lifecycle management', () => {
  it('uses a protected, auditable soft-deactivation RPC that protects upcoming appointments', () => {
    expect(migration).toContain('create or replace function public.set_clinician_active(target_doctor uuid, make_active boolean)');
    expect(migration).toContain("not public.has_permission('doctor_scheduling.manage_doctors')");
    expect(migration).toContain("appointment.status in ('scheduled', 'confirmed', 'rescheduled')");
    expect(migration).toContain("'clinician_removed'");
    expect(migration).toContain("'clinician_restored'");
    expect(migration).toContain('prevent_direct_clinician_lifecycle_change');
    expect(migration).toContain('pg_trigger_depth() <= 1');
    expect(migration).toContain('revoke all on function public.set_clinician_active(uuid, boolean) from public, anon');
    expect(migration).toContain('grant execute on function public.set_clinician_active(uuid, boolean) to authenticated, service_role');
  });

  it('keeps lifecycle actions behind the management RPC and presents restore separately', () => {
    expect(repository).toContain("rpc('set_clinician_active'");
    expect(repository).toContain('{ target_doctor: id, make_active: active }');
    expect(repository).not.toContain('async archiveDoctor');
    expect(screen).toContain('Edit Clinician');
    expect(screen).toContain('Remove Clinician');
    expect(screen).toContain('Restore Clinician');
    expect(screen).toContain('clinicianList');
    expect(screen).toContain('ClinicianAvatar');
  });

  it('does not expose a missing RPC schema-cache error in the clinician UI', () => {
    expect(screen).toContain("console.error('Unable to restore clinician', caught)");
    expect(clinicianLifecycleError(new Error('Could not find the function public.set_clinician_active(make_active, target_doctor) in the schema cache')))
      .toBe('Unable to update clinician status. Please try again.');
  });
});
