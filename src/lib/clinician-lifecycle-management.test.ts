import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260818130813_clinician_lifecycle_management.sql', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./doctor-scheduling-repository.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../components/doctor-scheduling.tsx', import.meta.url), 'utf8');

describe('clinician lifecycle management', () => {
  it('uses a protected, auditable soft-deactivation RPC that protects upcoming appointments', () => {
    expect(migration).toContain('create or replace function public.set_clinician_active');
    expect(migration).toContain("not public.has_permission('doctor_scheduling.manage_doctors')");
    expect(migration).toContain("appointment.status in ('scheduled', 'confirmed', 'rescheduled')");
    expect(migration).toContain("'clinician_removed'");
    expect(migration).toContain("'clinician_restored'");
    expect(migration).toContain('prevent_direct_clinician_lifecycle_change');
    expect(migration).toContain('pg_trigger_depth() <= 1');
  });

  it('keeps lifecycle actions behind the management RPC and presents restore separately', () => {
    expect(repository).toContain("rpc('set_clinician_active'");
    expect(repository).not.toContain('async archiveDoctor');
    expect(screen).toContain('Edit Clinician');
    expect(screen).toContain('Remove Clinician');
    expect(screen).toContain('Restore Clinician');
    expect(screen).toContain('clinicianList');
    expect(screen).toContain('ClinicianAvatar');
  });
});
