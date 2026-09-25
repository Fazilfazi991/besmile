import { describe, expect, it } from 'vitest';
import { showEmployeeId } from './employee-id-display';

describe('Employee Information ID visibility', () => {
  it('hides only Chairman and internal director IDs in the UI', () => {
    expect(showEmployeeId('chairman')).toBe(false);
    expect(showEmployeeId('director')).toBe(false);
    expect(showEmployeeId('employee')).toBe(true);
    expect(showEmployeeId('manager')).toBe(true);
  });
});
