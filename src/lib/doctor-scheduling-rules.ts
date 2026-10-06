import { BUSINESS_TIME_ZONE } from './business-time';

export const appointmentStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'] as const;
export type AppointmentStatus = typeof appointmentStatuses[number];
export const consultationTypes = ['in_person', 'online'] as const;
export type ConsultationType = typeof consultationTypes[number];

export type AvailabilityRange = { day_of_week: number; start_time: string; end_time: string };
export type BlockedPeriod = { blocked_date: string; start_time?: string | null; end_time?: string | null };
export type AppointmentWindow = { id?: string; start_at: string; end_at: string; status: AppointmentStatus };

export function validateAvailabilityRanges(ranges: AvailabilityRange[], consultationDurationMinutes: number) {
  const intervals: { start: number; end: number }[] = [];
  const validTime = (value: string, isEnd = false) => /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value) || (isEnd && /^24:00(?::00)?$/.test(value));
  for (const range of ranges) {
    if (!Number.isInteger(range.day_of_week) || range.day_of_week < 0 || range.day_of_week > 6 || !validTime(range.start_time) || !validTime(range.end_time, true)) return 'Choose a valid time range and weekday.';
    const start = minutesOfDay(range.start_time), end = minutesOfDay(range.end_time);
    if (start === end) return 'Start and end times must be different.';
    const duration = end - start + (end < start ? 1440 : 0);
    if (duration < consultationDurationMinutes) return 'Each availability range must fit at least one consultation.';
    intervals.push({ start: range.day_of_week * 1440 + start, end: range.day_of_week * 1440 + start + duration });
  }
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      // Compare repeating weeks too, including Saturday spilling into Sunday.
      if ([-10080, 0, 10080].some(shift => intervals[i].start < intervals[j].end + shift && intervals[i].end > intervals[j].start + shift)) return 'Availability ranges cannot overlap, including on the next day.';
    }
  }
  return null;
}

export const statusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  no_show: 'No Show',
};

export const statusTones: Record<AppointmentStatus, 'default' | 'pending' | 'success' | 'danger' | 'info'> = {
  scheduled: 'pending',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'danger',
  rescheduled: 'pending',
  no_show: 'danger',
};

export function minutesOfDay(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

export function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function businessLocalDateTime(date: string, minutes: number) {
  const [year, month, day] = date.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value || 0);
  const representedAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return new Date(guess - (representedAsUtc - guess));
}

function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date) {
  return start < otherEnd && end > otherStart;
}

export function generateAvailableSlots(input: {
  date: string;
  durationMinutes: number;
  cadenceMinutes?: number;
  availability: AvailabilityRange[];
  blockedPeriods: BlockedPeriod[];
  appointments: AppointmentWindow[];
  now?: Date;
  ignoreAppointmentId?: string;
}) {
  const day = new Date(`${input.date}T00:00:00Z`).getUTCDay();
  const now = input.now || new Date();
  const cadenceMinutes = input.cadenceMinutes ?? 60;
  if (!(input.durationMinutes > 0) || !(cadenceMinutes > 0)) return [];
  const blocked = input.blockedPeriods;
  const booked = input.appointments.filter(item => item.id !== input.ignoreAppointmentId && item.status !== 'cancelled');
  const slots: { startAt: string; endAt: string; label: string }[] = [];

  for (const range of input.availability) {
    const startMinute = minutesOfDay(range.start_time), endMinute = minutesOfDay(range.end_time);
    if (startMinute === endMinute) continue;
    const overnight = endMinute < startMinute;
    const originOffset = range.day_of_week === day ? 0 : range.day_of_week === (day + 6) % 7 && overnight ? -1440 : null;
    if (originOffset === null) continue;
    const rangeEnd = originOffset + endMinute + (overnight ? 1440 : 0);
    // Retain the origin range's cadence when its tail falls on the selected date.
    const first = originOffset + startMinute;
    const visibleFirst = first < 0 ? first + Math.ceil(-first / cadenceMinutes) * cadenceMinutes : first;
    for (let minute = visibleFirst; minute < 1440 && minute + input.durationMinutes <= rangeEnd; minute += cadenceMinutes) {
      const start = businessLocalDateTime(input.date, minute);
      const end = businessLocalDateTime(input.date, minute + input.durationMinutes);
      if (start <= now) continue;
      if (blocked.some(period => overlaps(start, end, businessLocalDateTime(period.blocked_date, period.start_time && period.end_time ? minutesOfDay(period.start_time) : 0), businessLocalDateTime(period.blocked_date, period.start_time && period.end_time ? minutesOfDay(period.end_time) : 1440)))) continue;
      if (booked.some(appointment => overlaps(start, end, new Date(appointment.start_at), new Date(appointment.end_at)))) continue;
      slots.push({ startAt: start.toISOString(), endAt: end.toISOString(), label: start.toLocaleTimeString('en-IN', { timeZone: BUSINESS_TIME_ZONE, hour: 'numeric', minute: '2-digit' }) });
    }
  }

  return [...new Map(slots.map(slot => [slot.startAt, slot])).values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function validateAppointmentFee(value: unknown) {
  if (value === '' || value === null || value === undefined) return 'Appointment fee is required.';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 'Appointment fee must be a valid non-negative amount.';
  if (Math.round(amount * 100) !== amount * 100) return 'Appointment fee can have at most two decimal places.';
  return null;
}

export function validateDoctorPayload(payload: { doctor_name: string; specialization: string; qualification: string; phone: string; email?: string | null; consultation_duration_minutes: number; notes?: string | null }) {
  if (payload.doctor_name.trim().length < 2) return 'Psychologist name is required.';
  if (payload.specialization.trim().length < 2) return 'Specialization is required.';
  if (payload.qualification.trim().length < 2) return 'Qualification is required.';
  if (payload.phone.trim().length < 6) return 'Phone number is required.';
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) return 'Enter a valid email address.';
  if (!Number.isFinite(payload.consultation_duration_minutes) || payload.consultation_duration_minutes < 5 || payload.consultation_duration_minutes > 240) return 'Consultation duration must be between 5 and 240 minutes.';
  if ((payload.notes || '').length > 500) return 'Notes must be 500 characters or fewer.';
  return null;
}
