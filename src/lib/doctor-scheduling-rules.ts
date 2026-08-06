export const appointmentStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'] as const;
export type AppointmentStatus = typeof appointmentStatuses[number];
export const consultationTypes = ['in_person', 'online'] as const;
export type ConsultationType = typeof consultationTypes[number];

export type AvailabilityRange = { day_of_week: number; start_time: string; end_time: string };
export type BlockedPeriod = { blocked_date: string; start_time?: string | null; end_time?: string | null };
export type AppointmentWindow = { id?: string; start_at: string; end_at: string; status: AppointmentStatus };

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

function localDateTime(date: string, minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return new Date(`${date}T${hour}:${minute}:00`);
}

function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date) {
  return start < otherEnd && end > otherStart;
}

export function generateAvailableSlots(input: {
  date: string;
  durationMinutes: number;
  availability: AvailabilityRange[];
  blockedPeriods: BlockedPeriod[];
  appointments: AppointmentWindow[];
  now?: Date;
  ignoreAppointmentId?: string;
}) {
  const day = new Date(`${input.date}T00:00:00`).getDay();
  const now = input.now || new Date();
  const blocked = input.blockedPeriods.filter(period => period.blocked_date === input.date);
  if (blocked.some(period => !period.start_time || !period.end_time)) return [];
  const booked = input.appointments.filter(item => item.id !== input.ignoreAppointmentId && item.status !== 'cancelled');
  const slots: { startAt: string; endAt: string; label: string }[] = [];

  for (const range of input.availability.filter(item => item.day_of_week === day)) {
    for (let minute = minutesOfDay(range.start_time); minute + input.durationMinutes <= minutesOfDay(range.end_time); minute += input.durationMinutes) {
      const start = localDateTime(input.date, minute);
      const end = localDateTime(input.date, minute + input.durationMinutes);
      if (start <= now) continue;
      if (blocked.some(period => overlaps(start, end, localDateTime(input.date, minutesOfDay(period.start_time || '00:00')), localDateTime(input.date, minutesOfDay(period.end_time || '23:59'))))) continue;
      if (booked.some(appointment => overlaps(start, end, new Date(appointment.start_at), new Date(appointment.end_at)))) continue;
      slots.push({ startAt: start.toISOString(), endAt: end.toISOString(), label: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    }
  }

  return slots;
}

export function validateDoctorPayload(payload: { doctor_name: string; specialization: string; qualification: string; phone: string; consultation_duration_minutes: number; notes?: string | null }) {
  if (payload.doctor_name.trim().length < 2) return 'Doctor name is required.';
  if (payload.specialization.trim().length < 2) return 'Specialization is required.';
  if (payload.qualification.trim().length < 2) return 'Qualification is required.';
  if (payload.phone.trim().length < 6) return 'Phone number is required.';
  if (!Number.isFinite(payload.consultation_duration_minutes) || payload.consultation_duration_minutes < 5 || payload.consultation_duration_minutes > 240) return 'Consultation duration must be between 5 and 240 minutes.';
  if ((payload.notes || '').length > 500) return 'Notes must be 500 characters or fewer.';
  return null;
}
