import { describe, expect, it } from 'vitest';
import { isLegacyPatientSource, normalizePatientSource, patientSourceLabel } from './patient-source';

describe('patient source rules', () => {
  it('normalizes supported source values to stable database values', () => {
    expect(normalizePatientSource('Walk-in')).toBe('walk_in');
    expect(normalizePatientSource('Phone Call')).toBe('phone_call');
    expect(normalizePatientSource('Social Media')).toBe('social_media');
    expect(normalizePatientSource('existing_patient')).toBe('existing_patient');
  });

  it('keeps unsupported existing source values visible as legacy values', () => {
    expect(normalizePatientSource('Community Event')).toBe('');
    expect(patientSourceLabel('Community Event')).toBe('Community Event');
    expect(isLegacyPatientSource('Community Event')).toBe(true);
  });
});
