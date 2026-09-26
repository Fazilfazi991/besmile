import { describe, expect, it } from 'vitest';
import { employeeDetailLabels } from './employee-detail-labels';

describe('employee detail display labels', () => {
  it('titles the stored Director role and designation Managing Director', () => {
    const stored = { role: 'director', designation: 'Director' };
    expect(employeeDetailLabels(stored.role, stored.designation)).toEqual({ title: 'Managing Director', role: 'Managing Director' });
    expect(stored).toEqual({ role: 'director', designation: 'Director' });
  });

  it('keeps Chairman and other employee titles as stored', () => {
    expect(employeeDetailLabels('director', 'Chairman')).toEqual({ title: 'Chairman', role: 'director' });
    expect(employeeDetailLabels('staff', 'Psychologist')).toEqual({ title: 'Psychologist', role: 'staff' });
    expect(employeeDetailLabels('director', 'QA Test Account')).toEqual({ title: 'QA Test Account', role: 'director' });
  });
});
