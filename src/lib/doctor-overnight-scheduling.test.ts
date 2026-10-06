import { describe, expect, it } from 'vitest';
import { generateAvailableSlots, validateAvailabilityRanges, type AvailabilityRange } from './doctor-scheduling-rules';
const range = (day: number, start = '13:30', end = '01:00'): AvailabilityRange => ({ day_of_week: day, start_time: start, end_time: end });
const slots = (date: string, availability: AvailabilityRange[], extra: Partial<Parameters<typeof generateAvailableSlots>[0]> = {}) => generateAvailableSlots({ date, availability, durationMinutes: 30, blockedPeriods: [], appointments: [], now: new Date('2026-01-01T00:00:00Z'), ...extra });

describe('overnight availability in Asia/Kolkata', () => {
  it.each([range(1), range(6, '13:00', '03:00'), range(0, '09:00', '17:00')])('accepts explicit weekday windows %j', value => {
    expect(validateAvailabilityRanges([value], 30)).toBeNull();
  });
  it.each([range(1, '09:00', '09:00'), range(9), range(1, '24:00', '01:00'), range(1, '10:99', '12:00'), range(1, '23:50', '00:00')])('rejects invalid/equal/too-short windows %j', value => {
    expect(validateAvailabilityRanges([value], 30)).not.toBeNull();
  });
  it.each([[1, 2], [6, 0], [0, 1]])('rejects cross-day overlap %s → %s and accepts adjacency', (day, next) => {
    expect(validateAvailabilityRanges([range(day, '20:00', '02:00'), range(next, '01:00', '04:00')], 30)).toMatch(/overlap/);
    expect(validateAvailabilityRanges([range(day, '20:00', '02:00'), range(next, '02:00', '04:00')], 30)).toBeNull();
    expect(validateAvailabilityRanges([range(day), range(next)], 30)).toBeNull();
  });
  it('lists Monday starts on Monday and retains the origin cadence for Tuesday tail', () => {
    const monday = slots('2026-08-10', [range(1)]), tuesday = slots('2026-08-11', [range(1)]);
    expect(monday).toHaveLength(11);
    expect(monday.at(-1)?.startAt).toBe('2026-08-10T18:00:00.000Z'); // Monday 23:30 IST
    expect(tuesday.map(s => [s.startAt, s.endAt])).toEqual([['2026-08-10T19:00:00.000Z', '2026-08-10T19:30:00.000Z']]); // Tuesday 00:30–01:00
  });
  it.each([['2026-08-09', 6], ['2026-08-10', 0]] as const)('recognizes previous weekday across week edge on %s', (date, day) => {
    expect(slots(date, [range(day, '13:00', '03:00')]).map(s => s.label)).toEqual(['12:00 am', '1:00 am', '2:00 am']);
  });
  it('keeps same-day hourly starts identical', () => {
    expect(slots('2026-08-10', [range(1, '09:00', '17:00')]).map(s => s.label)).toEqual(['9:00 am','10:00 am','11:00 am','12:00 pm','1:00 pm','2:00 pm','3:00 pm','4:00 pm']);
  });
  it('preserves existing SQL 24:00 end-of-day endpoints without treating equal clocks as all-day', () => {
    expect(validateAvailabilityRanges([range(1,'23:00','24:00')],30)).toBeNull();
    expect(slots('2026-08-10',[range(1,'23:00','24:00')])).toHaveLength(1);
  });
  it.each(['scheduled','confirmed','completed','rescheduled','no_show'] as const)('excludes overlapping %s bookings including across midnight', status => {
    const appointment = { id: 'booking', start_at: '2026-08-10T18:15:00Z', end_at: '2026-08-10T19:15:00Z', status };
    expect(slots('2026-08-11', [range(1)], { appointments: [appointment] })).toEqual([]);
    expect(slots('2026-08-11', [range(1)], { appointments: [appointment], ignoreAppointmentId: 'booking' })).toHaveLength(1);
  });
  it('cancelled appointments do not consume inherited slots', () => {
    expect(slots('2026-08-11', [range(1)], { appointments: [{ start_at: '2026-08-10T19:00:00Z', end_at: '2026-08-10T19:30:00Z', status: 'cancelled' }] })).toHaveLength(1);
  });
  it('applies same-day blocks on the next day without making blocks overnight', () => {
    expect(slots('2026-08-11', [range(1)], { blockedPeriods: [{ blocked_date: '2026-08-11' }] })).toEqual([]);
    expect(slots('2026-08-11', [range(1)], { blockedPeriods: [{ blocked_date: '2026-08-11', start_time: '00:45', end_time: '01:15' }] })).toEqual([]);
    // A Monday consultation that spans midnight must respect a Tuesday full-day block.
    expect(slots('2026-08-10', [range(1, '23:45', '01:00')], { blockedPeriods: [{ blocked_date: '2026-08-11' }] })).toEqual([]);
  });
  it('allows a consultation spanning midnight only inside an overnight window', () => {
    expect(slots('2026-08-10', [range(1, '23:45', '00:30')])).toHaveLength(1);
    expect(slots('2026-08-11', [range(1, '23:45', '00:30')])).toEqual([]); // cadence resumes 00:45, past range end
    expect(slots('2026-08-10', [range(1, '23:00', '23:50')], { durationMinutes: 60 })).toEqual([]);
  });
});
