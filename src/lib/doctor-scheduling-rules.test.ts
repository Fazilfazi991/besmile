import { describe, expect, it } from 'vitest';
import { generateAvailableSlots, validateAvailabilityRanges, validateDoctorPayload } from './doctor-scheduling-rules';

describe('doctor scheduling rules', () => {
  it('generates slots inside recurring availability and hides booked, blocked, and past slots', () => {
    const slots = generateAvailableSlots({
      date: '2026-08-10',
      durationMinutes: 30,
      now: new Date('2026-08-10T15:15:00'),
      availability: [{ day_of_week: 1, start_time: '15:00', end_time: '17:00' }],
      blockedPeriods: [{ blocked_date: '2026-08-10', start_time: '16:30', end_time: '17:00' }],
      appointments: [{ id: 'a1', start_at: new Date('2026-08-10T16:00:00').toISOString(), end_at: new Date('2026-08-10T16:30:00').toISOString(), status: 'scheduled' }],
    });

    expect(slots.map(slot => slot.startAt)).toEqual([new Date('2026-08-10T15:30:00').toISOString()]);
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

  it('rejects overlapping, inverted, and too-short availability ranges', () => {
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '', end_time: '' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '09:00', end_time: '' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '', end_time: '12:00' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '09:00', end_time: '09:00' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 1, start_time: '10:00', end_time: '09:00' }], 30)).toMatch(/valid time/i);
    expect(validateAvailabilityRanges([{ day_of_week: 1, start_time: '09:00', end_time: '09:15' }], 30)).toMatch(/fit/i);
    expect(validateAvailabilityRanges([{ day_of_week: 1, start_time: '09:00', end_time: '11:00' }, { day_of_week: 1, start_time: '10:30', end_time: '12:00' }], 30)).toMatch(/overlap/i);
    expect(validateAvailabilityRanges([{ day_of_week: 0, start_time: '09:00', end_time: '12:00' }], 30)).toBeNull();
  });

  it('allows an empty email but rejects an invalid email', () => {
    const doctor = { doctor_name: 'Dr. Amina', specialization: 'Dentistry', qualification: 'BDS', phone: '0501234567', consultation_duration_minutes: 30 };
    expect(validateDoctorPayload({ ...doctor, email: '' })).toBeNull();
    expect(validateDoctorPayload({ ...doctor, email: 'not-an-email' })).toBe('Enter a valid email address.');
  });
});
