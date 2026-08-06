import { supabase } from './supabase';
import { generateAvailableSlots, validateDoctorPayload, type AppointmentStatus, type ConsultationType } from './doctor-scheduling-rules';

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase as any;
};

const clean = (value: unknown) => String(value || '').trim();
const dateStart = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const dateEnd = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();

export type DoctorPayload = {
  doctor_name: string;
  specialization: string;
  qualification: string;
  phone: string;
  consultation_duration_minutes: number;
  status: 'active' | 'unavailable';
  notes?: string | null;
};

export const doctorSchedulingRepository = {
  async permissions() {
    const codes = [
      'doctor_scheduling.view',
      'doctor_scheduling.manage_doctors',
      'doctor_scheduling.create_appointments',
      'doctor_scheduling.update_appointments',
      'doctor_scheduling.cancel_appointments',
      'appointments.view',
      'appointments.create',
      'appointments.update',
      'appointments.reschedule',
      'appointments.cancel',
      'appointments.delete',
      'appointments.update_status',
    ];
    const results = await Promise.all(codes.map(code => db().rpc('has_permission', { permission_code: code })));
    return Object.fromEntries(codes.map((code, index) => [code, results[index].data === true]));
  },

  async doctors() {
    const { data, error } = await db().from('outsourced_doctors').select('*,availability:doctor_weekly_availability(*),blocked:doctor_blocked_periods(*)').order('doctor_name');
    if (error) throw error;
    return data || [];
  },

  async saveDoctor(payload: DoctorPayload & { id?: string; actorId: string }) {
    const message = validateDoctorPayload(payload);
    if (message) throw new Error(message);
    const row = {
      doctor_name: clean(payload.doctor_name),
      specialization: clean(payload.specialization),
      qualification: clean(payload.qualification),
      phone: clean(payload.phone),
      consultation_duration_minutes: Number(payload.consultation_duration_minutes),
      status: payload.status,
      notes: clean(payload.notes) || null,
      updated_by: payload.actorId,
    };
    const result = payload.id
      ? await db().from('outsourced_doctors').update(row).eq('id', payload.id).select().single()
      : await db().from('outsourced_doctors').insert({ ...row, created_by: payload.actorId }).select().single();
    if (result.error) throw result.error;
    return result.data;
  },

  async replaceAvailability(doctorId: string, actorId: string, ranges: { day_of_week: number; start_time: string; end_time: string }[]) {
    const r = db();
    const removed = await r.from('doctor_weekly_availability').delete().eq('doctor_id', doctorId);
    if (removed.error) throw removed.error;
    const valid = ranges.filter(range => range.start_time && range.end_time && range.start_time < range.end_time);
    if (!valid.length) return [];
    const { data, error } = await r.from('doctor_weekly_availability').insert(valid.map(range => ({ ...range, doctor_id: doctorId, created_by: actorId }))).select();
    if (error) throw error;
    return data || [];
  },

  async addBlockedPeriod(payload: { doctor_id: string; blocked_date: string; start_time?: string; end_time?: string; reason?: string; created_by: string }) {
    const { data, error } = await db().from('doctor_blocked_periods').insert({
      doctor_id: payload.doctor_id,
      blocked_date: payload.blocked_date,
      start_time: payload.start_time || null,
      end_time: payload.end_time || null,
      reason: clean(payload.reason) || null,
      created_by: payload.created_by,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async removeBlockedPeriod(id: string) {
    const { error } = await db().from('doctor_blocked_periods').delete().eq('id', id);
    if (error) throw error;
  },

  async patients(query = '') {
    let request = db().from('patients').select('id,full_name,patient_number,phone,slug').is('deleted_at', null).order('full_name').limit(40);
    if (query.trim()) request = request.or(`full_name.ilike.%${query.trim()}%,patient_number.ilike.%${query.trim()}%,phone.ilike.%${query.trim()}%`);
    const { data, error } = await request;
    if (error) throw error;
    return data || [];
  },

  async appointments(filters: { from?: string; to?: string; doctorId?: string; patientId?: string; status?: string } = {}) {
    let request = db().from('doctor_appointments').select('*,doctor:outsourced_doctors(*),patient:patients(id,full_name,patient_number,phone,slug),activity:doctor_appointment_activity(*)').is('deleted_at', null).order('start_at');
    if (filters.from) request = request.gte('start_at', filters.from.includes('T') ? filters.from : dateStart(filters.from));
    if (filters.to) request = request.lte('start_at', filters.to.includes('T') ? filters.to : dateEnd(filters.to));
    if (filters.doctorId) request = request.eq('doctor_id', filters.doctorId);
    if (filters.patientId) request = request.eq('patient_id', filters.patientId);
    if (filters.status) request = request.eq('status', filters.status);
    const { data, error } = await request;
    if (error) throw error;
    return data || [];
  },

  async patientAppointments(patientId: string) {
    return this.appointments({ patientId });
  },

  async summary() {
    const today = new Date().toISOString().slice(0, 10);
    const next = new Date();
    next.setDate(next.getDate() + 14);
    const [appointments, doctors] = await Promise.all([
      this.appointments({ from: today, to: next.toISOString().slice(0, 10) }),
      this.doctors(),
    ]);
    const day = new Date(`${today}T00:00:00`).getDay();
    return {
      today: appointments.filter((item: any) => String(item.start_at).slice(0, 10) === today && item.status !== 'cancelled').length,
      upcoming: appointments.filter((item: any) => new Date(item.start_at) > new Date() && !['cancelled', 'completed', 'no_show'].includes(item.status)).length,
      availableDoctorsToday: doctors.filter((doctor: any) => doctor.status === 'active' && doctor.availability?.some((range: any) => range.day_of_week === day)).length,
      changed: appointments.filter((item: any) => ['cancelled', 'rescheduled'].includes(item.status)).length,
    };
  },

  async slots(doctorId: string, date: string, ignoreAppointmentId?: string) {
    const [doctors, appointments] = await Promise.all([
      this.doctors(),
      this.appointments({ from: date, to: date, doctorId }),
    ]);
    const doctor = doctors.find((item: any) => item.id === doctorId);
    if (!doctor) return [];
    return generateAvailableSlots({
      date,
      durationMinutes: doctor.consultation_duration_minutes,
      availability: doctor.availability || [],
      blockedPeriods: doctor.blocked || [],
      appointments,
      ignoreAppointmentId,
    });
  },

  async createAppointment(payload: { patientId: string; doctorId: string; startAt: string; endAt: string; consultationType: ConsultationType; remarks?: string }) {
    const { data, error } = await db().rpc('create_doctor_appointment', {
      target_patient: payload.patientId,
      target_doctor: payload.doctorId,
      appointment_start: payload.startAt,
      appointment_end: payload.endAt,
      appointment_consultation_type: payload.consultationType,
      appointment_remarks: payload.remarks || null,
    });
    if (error) throw error;
    return data;
  },

  async updateAppointment(payload: { id: string; doctorId: string; startAt: string; endAt: string; consultationType: ConsultationType; status: AppointmentStatus; remarks?: string }) {
    const { data, error } = await db().rpc('update_doctor_appointment', {
      target_appointment: payload.id,
      target_doctor: payload.doctorId,
      appointment_start: payload.startAt,
      appointment_end: payload.endAt,
      appointment_consultation_type: payload.consultationType,
      next_status: payload.status,
      appointment_remarks: payload.remarks || null,
    });
    if (error) throw error;
    return data;
  },

  async setAppointmentStatus(id: string, status: AppointmentStatus, remarks = '') {
    const { data, error } = await db().rpc('update_doctor_appointment_status', { target_appointment: id, next_status: status, status_remarks: remarks || null });
    if (error) throw error;
    return data;
  },

  async rescheduleAppointment(id: string, startAt: string, endAt: string, remarks = '') {
    const { data, error } = await db().rpc('reschedule_doctor_appointment', { target_appointment: id, appointment_start: startAt, appointment_end: endAt, status_remarks: remarks || null });
    if (error) throw error;
    return data;
  },

  async deleteAppointment(id: string, remarks = '') {
    const { data, error } = await db().rpc('delete_doctor_appointment', { target_appointment: id, delete_remarks: remarks || null });
    if (error) throw error;
    return data;
  },
};
