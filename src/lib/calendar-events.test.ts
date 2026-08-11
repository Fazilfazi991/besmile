import { describe, expect, it } from 'vitest';
import { awarenessEventsForMonth } from './calendar-events';

describe('awarenessEventsForMonth', () => {
  const events = [
    { name: 'Friendship Day', recurrence_rule: 'first_sunday:08' },
    { name: "Mother's Day", recurrence_rule: 'second_sunday:05' },
    { name: 'International Stress Awareness Day', recurrence_rule: 'first_wednesday:11' },
    { name: 'ADHD Awareness Month', recurrence_rule: 'annual_month:10' },
    { name: 'OCD Awareness Week', recurrence_rule: 'configurable_period:10', notes: 'Exact mid-October dates require client confirmation.' },
  ];
  it('resolves PDF recurrence rules for 2026 and 2027', () => {
    expect(awarenessEventsForMonth(events, 2026, 8).days.get('2026-08-02')?.[0].name).toBe('Friendship Day');
    expect(awarenessEventsForMonth(events, 2027, 5).days.get('2027-05-09')?.[0].name).toBe("Mother's Day");
    expect(awarenessEventsForMonth(events, 2027, 11).days.get('2027-11-03')?.[0].name).toBe('International Stress Awareness Day');
  });
  it('keeps non-specific periods out of an invented day', () => {
    const result = awarenessEventsForMonth(events, 2027, 10);
    expect(result.days.size).toBe(0);
    expect(result.periods.map(event => event.name)).toEqual(['ADHD Awareness Month', 'OCD Awareness Week']);
  });
});
