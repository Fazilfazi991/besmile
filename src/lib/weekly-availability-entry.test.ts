import { describe, expect, it } from 'vitest';
import { DAY_PRESETS, expandAvailabilityGroups as expand, groupWeeklyRanges as group, normalizeWeeklyRanges, parseAvailabilityText as parse, validateAvailabilityGroups as validate } from './weekly-availability-entry';
const slot = (start_time = '09:00', end_time = '10:00') => ({ start_time, end_time });
const days = [1, 2, 3, 4, 5, 6];
const example = 'Mon-Sat: 9-10 AM, 2-3 PM, 6-7 PM\nSun: 10 AM-1 PM';

describe('structured canonical weekly availability', () => {
  it.each([[[1]], [days], [[1, 3]]])('expands selected days %j with one slot', selected => {
    expect(expand([{ days: selected, slots: [slot()] }])).toEqual([...selected].sort().map(day_of_week => ({ day_of_week, ...slot() })));
  });
  it('expands three repeated slots and separate Sunday to exactly nineteen rows', () => {
    const groups = [{ days, slots: [slot(), slot('14:00', '15:00'), slot('18:00', '19:00')] }, { days: [0], slots: [slot('10:00', '13:00')] }];
    expect(expand(groups)).toHaveLength(19); expect(validate(groups, 30)).toBeNull();
    expect(expand(groups)[0]).toEqual({ day_of_week: 0, ...slot('10:00', '13:00') });
    expect(expand(groups.slice(1))).toEqual([{ day_of_week: 0, ...slot('10:00', '13:00') }]);
  });
  it('deduplicates identical groups, slots, and canonical zero seconds before overlap checks', () => {
    const value = { days: [1], slots: [slot(), slot('09:00:00', '10:00:00')] };
    expect(expand([value, value])).toHaveLength(1); expect(validate([value, value], 30)).toBeNull();
  });
  it.each([
    [slot('09:00', '11:00'), slot('10:00', '12:00'), 'overlap'],
    [slot('09:00', '09:00'), slot('12:00', '13:00'), 'different'],
    [slot('09:00', '09:10'), slot('12:00', '13:00'), 'consultation'],
    [slot('24:00', '01:00'), slot('12:00', '13:00'), 'valid'],
    [slot('09:00:15', '10:00'), slot('12:00', '13:00'), 'valid'],
  ])('rejects invalid ranges %j and %j', (first, second, message) => {
    expect(validate([{ days: [1], slots: [first, second] }], 30)).toContain(message);
  });
  it('accepts adjacency and overnight ranges without splitting', () => {
    expect(validate([{ days: [1], slots: [slot('09:00', '10:00'), slot('10:00', '11:00'), slot('13:30', '01:00')] }], 30)).toBeNull();
    expect(expand([{ days, slots: [slot('13:30', '01:00')] }])).toHaveLength(6);
  });
  it.each([[1, 2], [6, 0]])('rejects next-day overlaps %s–%s including the week boundary', (first, next) => {
    expect(validate([{ days: [first], slots: [slot('20:00', '02:00')] }, { days: [next], slots: [slot('01:00', '03:00')] }], 30)).toContain('next day');
  });
  it('requires days and slots, and allows explicit clearing with no groups', () => {
    expect(validate([{ days: [], slots: [slot()] }], 30)).toContain('Select');
    expect(validate([{ days: [1], slots: [] }], 30)).toContain('Add');
    expect(validate([], 30)).toBeNull();
  });
  it('groups only complete identical day schedules and round-trips midnight, overnight and split ranges', () => {
    const rows = [{ day_of_week: 1, ...slot('13:30:00', '01:00:00') }, { day_of_week: 1, ...slot('09:00', '10:00') }, { day_of_week: 2, ...slot('09:00', '10:00') }, { day_of_week: 0, ...slot('23:00', '24:00:00') }];
    expect(group(rows)).toHaveLength(3);
    expect(expand(group(rows))).toEqual(normalizeWeeklyRanges(rows));
    expect(expand(group(rows)).find(row => row.day_of_week === 0)?.end_time).toBe('24:00');
  });
  it('includes all requested presets', () => {
    expect(DAY_PRESETS.map(value => value.days.length)).toEqual([5, 6, 5, 7, 2]);
  });
});
describe('optional text parsing with no persistence', () => {
  it('parses the business example exactly and preview round-trips into editable groups', () => {
    const result = parse(example, 30);
    expect(result.error).toBeNull(); expect(result.ranges).toHaveLength(19);
    for (const day_of_week of days) expect(result.ranges.filter(row => row.day_of_week === day_of_week)).toEqual([
      { day_of_week, ...slot() }, { day_of_week, ...slot('14:00', '15:00') }, { day_of_week, ...slot('18:00', '19:00') },
    ]);
    expect(result.ranges[0]).toEqual({ day_of_week: 0, ...slot('10:00', '13:00') });
    expect(expand(result.groups)).toEqual(result.ranges);
  });
  it.each([
    ['Monday to Friday: 9:00 AM - 10:00 AM, 2 PM - 3 PM', 10],
    ['Mon-Fri 10AM-12PM, 2PM-7PM\nSat 10AM-1PM\nSun 2PM-5PM', 12],
    ['Mon, Wed, Fri: 6 PM-9 PM', 3],
    ['Monday, Wednesday, Friday: 18:00-21:00', 3],
    ['Sunday-Thursday: 09:00-10:00', 5],
    ['Sunday-Saturday: 09:00-10:00', 7],
    ['Monday-Sunday: 09:00-10:00', 7],
    ['All days: 09:00-10:00', 7],
    ['Every day: 09:00-10:00', 7],
    ['Weekdays: 09:00-10:00', 5],
    ['Weekends: 09:00-10:00', 2],
    ['Monday - Friday: 9.30 AM to 10.30 AM', 5],
    ['Mon: 9:30am-10:30am', 1],
    ['Monday: 12 AM-1 AM, 12 PM-1 PM', 2],
    ['Mon-Sat: 9-10 AM, 2-3 PM,\n6-7 PM\nSun: 10 AM-1 PM', 19],
    ['Monday: 23:00-24:00', 1],
  ])('supports %s', (input, count) => { const result = parse(input, 30); expect(result.error).toBeNull(); expect(result.ranges).toHaveLength(count); });
  it('preserves explicit cross-midnight semantics', () => {
    const result = parse('Monday-Saturday: 1:30 PM-1 AM', 30);
    expect(result.error).toBeNull(); expect(result.ranges).toEqual(days.map(day_of_week => ({ day_of_week, ...slot('13:30', '01:00') })));
  });
  it.each([
    ['Sunday: Anytime', 'specific start and end'],
    ['Monday: 9 AM, 2 PM, 6 PM', 'start times but no end times'],
    ['Funday: 9 AM-10 AM', 'weekday'],
    ['constructor-Monday: 9 AM-10 AM', 'weekday'],
    ['constructor: 9 AM-10 AM', 'weekday'],
    ['Mon, Monday: 9 AM-10 AM', 'Conflicting'],
    ['Mon-Thu, Wed: 9 AM-10 AM', 'Conflicting'],
    ['Monday: 9-10', 'AM/PM'],
    ['Monday: 11-1 PM', 'ambiguous'],
    ['Monday: 13 AM-2 PM', 'between 1 and 12'],
    ['Monday: 9:75 AM-10 AM', 'Minutes'],
    ['Monday: 09:00-25:00', '24-hour'],
    ['Monday: 9 AM-', 'start and end'],
    ['Monday: 9 AM-9 AM', 'different'],
    ['Monday: 09:00-09:10', 'consultation'],
    ['Monday: 9 AM-11 AM, 10 AM-12 PM', 'overlap'],
    ['Saturday: 11 PM-2 AM\nSunday: 1 AM-3 AM', 'next day'],
    ['Monday: 9 AM-10 AM\ninvalid text', 'Line 2'],
    ['', 'Enter weekdays'],
  ])('rejects %s atomically', (input, message) => {
    const result = parse(input, 30); expect(result.error).toContain(message); expect(result.groups).toEqual([]); expect(result.ranges).toEqual([]);
  });
  it('deduplicates exact pasted ranges but does not merge overlapping ranges', () => {
    expect(parse('Monday: 9 AM-10 AM, 9 AM-10 AM', 30).ranges).toHaveLength(1);
  });
});
