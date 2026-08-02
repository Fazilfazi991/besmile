import { describe, expect, it } from 'vitest';
import { isActiveHoliday, wouldCreateReportingCycle } from './staff-structure-rules';

describe('staff structure rules', () => {
  it('blocks self and circular reporting relationships', () => {
    const profiles = [{ id: 'director', manager_id: null }, { id: 'gm', manager_id: 'director' }, { id: 'social-worker', manager_id: 'gm' }];
    expect(wouldCreateReportingCycle('gm', 'social-worker', profiles)).toBe(true);
    expect(wouldCreateReportingCycle('gm', 'gm', profiles)).toBe(true);
    expect(wouldCreateReportingCycle('social-worker', 'director', profiles)).toBe(false);
  });

  it('excludes inactive holidays from leave calculations', () => {
    expect(isActiveHoliday({})).toBe(true);
    expect(isActiveHoliday({ is_active: false })).toBe(false);
  });
});
