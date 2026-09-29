import { describe, expect, it } from 'vitest';
import { isConvertedClient } from './client-conversion';

describe('client conversion identity', () => {
  it('requires the proven patient relationship rather than a sale-era timestamp', () => {
    expect(isConvertedClient({ converted_patient_id: 'patient-1' })).toBe(true);
    expect(isConvertedClient({ converted_patient_id: null })).toBe(false);
    expect(isConvertedClient({})).toBe(false);
  });
});
