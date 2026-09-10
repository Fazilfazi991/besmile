import { BUSINESS_TIME_ZONE } from './business-time';

export const appointmentStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'] as const;
export type AppointmentStatus = typeof appointmentStatuses[number];
export const consultationTypes = ['in_person', 'online'] as const;
export type ConsultationType = typeof consultationTypes[number];

export type AvailabilityRange = { day_of_week: number; start_time: string; end_time: string };
export type BlockedPeriod = { blocked_date: string; start_time?: string | null; end_time?: string | null };
export type AppointmentWindow = { id?: string; start_at: string; end_at: string; status: AppointmentStatus };

export function validateAvailabilityRanges(ranges: AvailabilityRange[], consultationDurationMinutes: number) {
  const byDay = new Map<number, AvailabilityRange[]>();
  for (const range of ranges) byDay.set(range.day_of_week, [...(byDay.get(range.day_of_week) || []), range]);
  for (const [day, dayRanges] of byDay) {
    const sorted = [...dayRanges].sort((left, right) => left.start_time.localeCompare(right.start_time));
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      if (!current.start_time || !current.end_time) return `Choose a valid time range for ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}.`;
      if (minutesOfDay(current.end_time) <= minutesOfDay(current.start_time)) return 'End time must be later than start time.';
      if (minutesOfDay(current.end_time) - minutesOfDay(current.start_time) < consultationDurationMinutes) return 'Each availability range must fit at least one consultation.';
      if (index > 0 && minutesOfDay(current.start_time) < minutesOfDay(sorted[index - 1].end_time)) return `Availability ranges overlap on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}.`;
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
  const blocked = input.blockedPeriods.filter(period => period.blocked_date === input.date);
  if (blocked.some(period => !period.start_time || !period.end_time)) return [];
  const booked = input.appointments.filter(item => item.id !== input.ignoreAppointmentId && item.status !== 'cancelled');
  const slots: { startAt: string; endAt: string; label: string }[] = [];

  for (const range of input.availability.filter(item => item.day_of_week === day)) {
    for (let minute = minutesOfDay(range.start_time); minute + input.durationMinutes <= minutesOfDay(range.end_time); minute += cadenceMinutes) {
      const start = businessLocalDateTime(input.date, minute);
      const end = businessLocalDateTime(input.date, minute + input.durationMinutes);
      if (start <= now) continue;
      if (blocked.some(period => overlaps(start, end, businessLocalDateTime(input.date, minutesOfDay(period.start_time || '00:00')), businessLocalDateTime(input.date, minutesOfDay(period.end_time || '23:59'))))) continue;
      if (booked.some(appointment => overlaps(start, end, new Date(appointment.start_at), new Date(appointment.end_at)))) continue;
      slots.push({ startAt: start.toISOString(), endAt: end.toISOString(), label: start.toLocaleTimeString('en-IN', { timeZone: BUSINESS_TIME_ZONE, hour: 'numeric', minute: '2-digit' }) });
    }
  }

  return slots;
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
