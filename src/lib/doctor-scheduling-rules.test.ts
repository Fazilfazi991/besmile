import { describe, expect, it } from 'vitest';
import { generateAvailableSlots, validateAppointmentFee, validateAvailabilityRanges, validateDoctorPayload } from './doctor-scheduling-rules';

describe('doctor scheduling rules', () => {
  it('generates slots inside recurring availability and hides booked, blocked, and past slots', () => {
    const slots = generateAvailableSlots({
      date: '2026-08-10',
      durationMinutes: 30,
      now: new Date('2026-08-10T09:00:00Z'),
      availability: [{ day_of_week: 1, start_time: '15:00', end_time: '18:00' }],
      blockedPeriods: [{ blocked_date: '2026-08-10', start_time: '16:00', end_time: '16:30' }],
      appointments: [{ id: 'a1', start_at: new Date('2026-08-10T09:30:00Z').toISOString(), end_at: new Date('2026-08-10T10:00:00Z').toISOString(), status: 'scheduled' }],
    });

    expect(slots.map(slot => slot.startAt)).toEqual([new Date('2026-08-10T11:30:00Z').toISOString()]);
  });

  it('offers hourly starts while retaining the clinician session duration and business timezone', () => {
    const slots = generateAvailableSlots({
      date: '2026-08-10', durationMinutes: 45, now: new Date('2026-08-09T00:00:00Z'),
      availability: [{ day_of_week: 1, start_time: '09:00', end_time: '12:30' }], blockedPeriods: [], appointments: [],
    });
    expect(slots.map(slot => [slot.startAt, slot.endAt])).toEqual([
      ['2026-08-10T03:30:00.000Z', '2026-08-10T04:15:00.000Z'],
      ['2026-08-10T04:30:00.000Z', '2026-08-10T05:15:00.000Z'],
      ['2026-08-10T05:30:00.000Z', '2026-08-10T06:15:00.000Z'],
    ]);
    expect(slots.map(slot => slot.label)).toEqual(['9:00 am', '10:00 am', '11:00 am']);
  });

  it('returns no slots for a full-day block', () => {
    const slots = generateAvailableSlots({
      date: '2026-08-12',
      durationMinutes: 30,
      now: new Date('2026-08-11T09:00:00'),
      availability: [{ day_of_week: 3, start_time: '10:00', end_time: '12:00' }],
      blockedPeriods: [{ blocked_date: '2026-08-12' }],
      appointments: [],
    });

    expect(slots).toEqual([]);
  });

  it('accepts same-day availability ranges that end after they start', () => {
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '09:00', end_time: '17:00' }], 30)).toBeNull();
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '17:53', end_time: '18:00' }], 5)).toBeNull();
    expect(validateAvailabilityRanges([
      { day_of_week: 0, start_time: '09:00', end_time: '12:00' },
      { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
    ], 30)).toBeNull();
  });

  it('rejects incomplete, inverted, overlapping, and too-short availability ranges', () => {
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '', end_time: '' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '09:00', end_time: '' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '', end_time: '12:00' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '09:00', end_time: '09:00' }], 30)).toBe('End time must be later than start time.');
    expect(validateAvailabilityRanges([{ day_of_week: 1, start_time: '17:53', end_time: '16:55' }], 30)).toBe('End time must be later than start time.');
    expect(validateAvailabilityRanges([{ day_of_week: 1, start_time: '23:00', end_time: '01:00' }], 30)).toBe('End time must be later than start time.');
    expect(validateAvailabilityRanges([{ day_of_week: 1, start_time: '09:00', end_time: '09:15' }], 30)).toMatch(/fit/i);
    expect(validateAvailabilityRanges([{ day_of_week: 1, start_time: '09:00', end_time: '11:00' }, { day_of_week: 1, start_time: '10:30', end_time: '12:00' }], 30)).toMatch(/overlap/i);
  });

  it('allows an empty email but rejects an invalid email', () => {
    const doctor = { doctor_name: 'Dr. Amina', specialization: 'Dentistry', qualification: 'BDS', phone: '0501234567', consultation_duration_minutes: 30 };
    expect(validateDoctorPayload({ ...doctor, email: '' })).toBeNull();
    expect(validateDoctorPayload({ ...doctor, email: 'not-an-email' })).toBe('Enter a valid email address.');
  });

  it('accepts non-negative appointment fees and rejects missing, negative, or over-precision values', () => {
    expect(validateAppointmentFee(0)).toBeNull();
    expect(validateAppointmentFee('1250.50')).toBeNull();
    expect(validateAppointmentFee('')).toMatch(/required/i);
    expect(validateAppointmentFee(-1)).toMatch(/non-negative/i);
    expect(validateAppointmentFee(10.001)).toMatch(/two decimal/i);
  });
});
