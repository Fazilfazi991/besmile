import { describe, expect, it } from 'vitest';
import { employeeEditPayload, normalizeDateOnly } from './employee-edit-rules';

describe('employee edit date-only rules', () => {
  it('preserves an exact date-only value without timezone conversion', () => expect(normalizeDateOnly('2026-08-01')).toBe('2026-08-01'));
  it('allows an optional joining date to be cleared', () => expect(normalizeDateOnly('')).toBeNull());
  it('rejects malformed and impossible dates', () => { expect(() => normalizeDateOnly('08/01/2026')).toThrow(); expect(() => normalizeDateOnly('2026-02-30')).toThrow(); });
  it('serializes a safe update payload with nullable relations', () => expect(employeeEditPayload({ joining_date: '2026-08-01', department_id: '', manager_id: '' })).toMatchObject({ joining_date: '2026-08-01', department_id: null, manager_id: null }));
});
