import { describe, expect, it } from 'vitest';
import { clinicianLifecycleError } from './clinician-lifecycle';

describe('clinician lifecycle errors', () => {
  it('does not expose a missing PostgREST RPC signature to users', () => {
    expect(clinicianLifecycleError(new Error('Could not find the function public.set_clinician_active(make_active, target_doctor) in the schema cache')))
      .toBe('Unable to update clinician status. Please try again.');
  });

  it('preserves safe lifecycle guidance', () => {
    expect(clinicianLifecycleError(new Error('This clinician has 2 upcoming or active appointments. Reassign or cancel them before removing the clinician.')))
      .toContain('upcoming or active appointments');
    expect(clinicianLifecycleError(new Error('Permission denied for clinician lifecycle management')))
      .toBe('You do not have permission to update clinician status.');
  });
});
