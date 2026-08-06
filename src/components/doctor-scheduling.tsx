'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { currentProfile } from '@/lib/auth';
import { doctorSchedulingRepository, type DoctorPayload } from '@/lib/doctor-scheduling-repository';
import { appointmentStatuses, consultationTypes, statusLabels, statusTones, type AppointmentStatus } from '@/lib/doctor-scheduling-rules';
import { EmployeeBanner, EmployeeEmptyState, EmployeeLoading, EmployeeMetric, EmployeeMetricGrid, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const emptyDoctor: DoctorPayload = { doctor_name: '', specialization: '', qualification: '', phone: '', consultation_duration_minutes: 30, status: 'active', notes: '' };

const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: Date, daysToAdd: number) => { const next = new Date(value); next.setDate(next.getDate() + daysToAdd); return next; };
const fmtDate = (value: string | Date) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const fmtTime = (value: string | Date) => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export function DoctorSchedulingPage({ initialPatientId }: { initialPatientId?: string }) {
  const [profile, setProfile] = useState<any>();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>();
  const [tab, setTab] = useState<'Schedule' | 'Doctors' | 'Appointments'>('Schedule');
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [cursor, setCursor] = useState(dateKey(new Date()));
  const [doctorFilter, setDoctorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState(initialPatientId || '');
  const [selected, setSelected] = useState<any>();
  const [doctorForm, setDoctorForm] = useState<any>(emptyDoctor);
  const [availability, setAvailability] = useState<Record<number, { start_time: string; end_time: string }[]>>({});
  const [blockForm, setBlockForm] = useState({ doctor_id: '', blocked_date: dateKey(new Date()), start_time: '', end_time: '', reason: '' });
  const [appointmentForm, setAppointmentForm] = useState({ patient_id: initialPatientId || '', doctor_id: '', date: dateKey(new Date()), slot: '', consultation_type: 'in_person', remarks: '' });
  const [slots, setSlots] = useState<any[]>([]);
  const [reschedule, setReschedule] = useState<any>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [me, perms, doctorRows, patientRows, appointmentRows, counts] = await Promise.all([
        currentProfile(),
        doctorSchedulingRepository.permissions(),
        doctorSchedulingRepository.doctors(),
        doctorSchedulingRepository.patients(),
        doctorSchedulingRepository.appointments({ from: dateKey(addDays(new Date(), -45)), to: dateKey(addDays(new Date(), 90)) }),
        doctorSchedulingRepository.summary(),
      ]);
      setProfile(me);
      setPermissions(perms);
      setDoctors(doctorRows);
      setPatients(patientRows);
      setAppointments(appointmentRows);
      setSummary(counts);
      setError('');
    } catch (caught: any) {
      setError(caught.message || 'Unable to load Doctor Scheduling.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!appointmentForm.doctor_id || !appointmentForm.date) { setSlots([]); return; }
      try {
        setSlots(await doctorSchedulingRepository.slots(appointmentForm.doctor_id, appointmentForm.date, reschedule?.id));
      } catch {
        setSlots([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [appointmentForm.doctor_id, appointmentForm.date, reschedule?.id]);

  const canManageDoctors = permissions['doctor_scheduling.manage_doctors'];
  const canCreate = permissions['doctor_scheduling.create_appointments'];
  const canUpdate = permissions['doctor_scheduling.update_appointments'];
  const canCancel = permissions['doctor_scheduling.cancel_appointments'];
  const filteredAppointments = useMemo(() => appointments.filter(item => (!doctorFilter || item.doctor_id === doctorFilter) && (!patientFilter || item.patient_id === patientFilter) && (!statusFilter || item.status === statusFilter)), [appointments, doctorFilter, patientFilter, statusFilter]);
  const visibleDays = useMemo(() => daysForView(cursor, view), [cursor, view]);
  const currentDoctor = doctors.find(item => item.id === appointmentForm.doctor_id);

  const editDoctor = (doctor: any) => {
    setDoctorForm({ id: doctor.id, doctor_name: doctor.doctor_name, specialization: doctor.specialization, qualification: doctor.qualification, phone: doctor.phone, consultation_duration_minutes: doctor.consultation_duration_minutes, status: doctor.status, notes: doctor.notes || '' });
    const grouped: Record<number, { start_time: string; end_time: string }[]> = {};
    for (const range of doctor.availability || []) grouped[range.day_of_week] = [...(grouped[range.day_of_week] || []), { start_time: range.start_time.slice(0, 5), end_time: range.end_time.slice(0, 5) }];
    setAvailability(grouped);
    setTab('Doctors');
  };

  const saveDoctor = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving('doctor'); setError(''); setNotice('');
    try {
      const doctor = await doctorSchedulingRepository.saveDoctor({ ...doctorForm, consultation_duration_minutes: Number(doctorForm.consultation_duration_minutes), actorId: profile.id });
      const ranges = Object.entries(availability).flatMap(([day, rows]) => rows.map(row => ({ day_of_week: Number(day), start_time: row.start_time, end_time: row.end_time })));
      await doctorSchedulingRepository.replaceAvailability(doctor.id, profile.id, ranges);
      setDoctorForm(emptyDoctor);
      setAvailability({});
      setNotice('Doctor profile saved.');
      await load();
    } catch (caught: any) {
      setError(caught.message || 'Unable to save doctor.');
    } finally {
      setSaving('');
    }
  };

  const addBlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving('block'); setError(''); setNotice('');
    try {
      await doctorSchedulingRepository.addBlockedPeriod({ ...blockForm, created_by: profile.id });
      setBlockForm(current => ({ ...current, start_time: '', end_time: '', reason: '' }));
      setNotice('Unavailable period saved.');
      await load();
    } catch (caught: any) {
      setError(caught.message || 'Unable to block date.');
    } finally {
      setSaving('');
    }
  };

  const submitAppointment = async (event: FormEvent) => {
    event.preventDefault();
    const slot = slots.find(item => item.startAt === appointmentForm.slot);
    if (!slot) { setError('Choose an available slot.'); return; }
    setSaving('appointment'); setError(''); setNotice('');
    try {
      if (reschedule) {
        await doctorSchedulingRepository.rescheduleAppointment(reschedule.id, slot.startAt, slot.endAt, appointmentForm.remarks);
        setNotice('Appointment rescheduled.');
      } else {
        await doctorSchedulingRepository.createAppointment({ patientId: appointmentForm.patient_id, doctorId: appointmentForm.doctor_id, startAt: slot.startAt, endAt: slot.endAt, consultationType: appointmentForm.consultation_type as any, remarks: appointmentForm.remarks });
        setNotice('Appointment scheduled.');
      }
      setReschedule(null);
      setAppointmentForm({ patient_id: initialPatientId || '', doctor_id: '', date: dateKey(new Date()), slot: '', consultation_type: 'in_person', remarks: '' });
      await load();
    } catch (caught: any) {
      setError(caught.message || 'Unable to save appointment.');
    } finally {
      setSaving('');
    }
  };

  const changeStatus = async (appointment: any, status: AppointmentStatus) => {
    setSaving(appointment.id); setError(''); setNotice('');
    try {
      await doctorSchedulingRepository.setAppointmentStatus(appointment.id, status);
      setNotice(`Appointment marked ${statusLabels[status].toLowerCase()}.`);
      setSelected(undefined);
      await load();
    } catch (caught: any) {
      setError(caught.message || 'Unable to update appointment.');
    } finally {
      setSaving('');
    }
  };

  const startReschedule = (appointment: any) => {
    setReschedule(appointment);
    setAppointmentForm({ patient_id: appointment.patient_id, doctor_id: appointment.doctor_id, date: dateKey(new Date(appointment.start_at)), slot: '', consultation_type: appointment.consultation_type, remarks: appointment.remarks || '' });
    setTab('Appointments');
    setSelected(undefined);
  };

  if (loading) return <section><EmployeePageHeader title="Doctor Scheduling" subtitle="Outsourced doctor availability and appointments." /><EmployeeLoading cards={4} /></section>;

  return <section className="doctor-scheduling">
    <EmployeePageHeader title="Doctor Scheduling" subtitle="Manage outsourced doctor availability, appointments, and scheduling." action={canCreate ? <button className="btn btn-primary" type="button" onClick={() => setTab('Appointments')}>Create Appointment</button> : undefined} />
    {error && <EmployeeBanner>{error}</EmployeeBanner>}{notice && <EmployeeBanner tone="success">{notice}</EmployeeBanner>}
    <EmployeeMetricGrid columns={4}><EmployeeMetric label="Appointments today" value={summary?.today || 0} /><EmployeeMetric label="Upcoming" value={summary?.upcoming || 0} tone="info" /><EmployeeMetric label="Available doctors today" value={summary?.availableDoctorsToday || 0} tone="success" /><EmployeeMetric label="Cancelled or rescheduled" value={summary?.changed || 0} tone="pending" /></EmployeeMetricGrid>
    <div className="doctor-tabs">{(['Schedule', 'Doctors', 'Appointments'] as const).map(item => <button type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>

    {tab === 'Schedule' && <EmployeeSection title="Schedule" description="Day, week, and month views collapse into an agenda on mobile.">
      <Filters doctors={doctors} patients={patients} doctorFilter={doctorFilter} setDoctorFilter={setDoctorFilter} patientFilter={patientFilter} setPatientFilter={setPatientFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
      <div className="schedule-toolbar"><div>{(['day', 'week', 'month'] as const).map(item => <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>{label(item)}</button>)}</div><div><button type="button" onClick={() => setCursor(dateKey(addDays(new Date(cursor), view === 'month' ? -30 : view === 'week' ? -7 : -1)))}>Previous</button><button type="button" onClick={() => setCursor(dateKey(new Date()))}>Today</button><button type="button" onClick={() => setCursor(dateKey(addDays(new Date(cursor), view === 'month' ? 30 : view === 'week' ? 7 : 1)))}>Next</button></div></div>
      <div className={`schedule-grid schedule-${view}`}>{visibleDays.map(day => { const key = dateKey(day); const rows = filteredAppointments.filter(item => dateKey(new Date(item.start_at)) === key); return <section className="schedule-day" key={key}><header><b>{view === 'month' ? day.getDate() : fmtDate(day)}</b><small>{shortDays[day.getDay()]}</small></header>{rows.length ? rows.map(item => <button className="appointment-card" type="button" onClick={() => setSelected(item)} key={item.id}><time>{fmtTime(item.start_at)}</time><b>{item.patient?.full_name || 'Patient'}</b><small>{item.doctor?.doctor_name || 'Doctor'}</small><EmployeeStatusBadge tone={statusTones[item.status as AppointmentStatus]}>{statusLabels[item.status as AppointmentStatus]}</EmployeeStatusBadge></button>) : <p className="schedule-empty">No appointments</p>}</section>; })}</div>
    </EmployeeSection>}

    {tab === 'Doctors' && <div className="doctor-two-column">
      <EmployeeSection title="Doctors" description="Only outsourced doctor scheduling fields are captured.">{doctors.length ? <div className="doctor-list">{doctors.map(doctor => <article key={doctor.id}><div><b>{doctor.doctor_name}</b><small>{doctor.specialization} - {doctor.qualification}</small><small>{doctor.phone} - {doctor.consultation_duration_minutes} min</small></div><EmployeeStatusBadge tone={doctor.status === 'active' ? 'success' : 'danger'}>{label(doctor.status)}</EmployeeStatusBadge>{canManageDoctors && <button className="btn border" type="button" onClick={() => editDoctor(doctor)}>Edit</button>}</article>)}</div> : <EmployeeEmptyState title="No doctors yet" detail="Add outsourced doctors and weekly availability to start scheduling." />}</EmployeeSection>
      {canManageDoctors && <EmployeeSection title={doctorForm.id ? 'Edit Doctor' : 'Add Doctor'} description="Keep this profile scheduling-focused.">
        <form className="doctor-form" onSubmit={saveDoctor}>
          <input className="input" placeholder="Doctor name" value={doctorForm.doctor_name} onChange={e => setDoctorForm({ ...doctorForm, doctor_name: e.target.value })} />
          <input className="input" placeholder="Specialization" value={doctorForm.specialization} onChange={e => setDoctorForm({ ...doctorForm, specialization: e.target.value })} />
          <input className="input" placeholder="Qualification" value={doctorForm.qualification} onChange={e => setDoctorForm({ ...doctorForm, qualification: e.target.value })} />
          <input className="input" placeholder="Phone number" value={doctorForm.phone} onChange={e => setDoctorForm({ ...doctorForm, phone: e.target.value })} />
          <input className="input" type="number" min="5" max="240" value={doctorForm.consultation_duration_minutes} onChange={e => setDoctorForm({ ...doctorForm, consultation_duration_minutes: Number(e.target.value) })} />
          <select className="input" value={doctorForm.status} onChange={e => setDoctorForm({ ...doctorForm, status: e.target.value })}><option value="active">Active</option><option value="unavailable">Unavailable</option></select>
          <textarea className="input md:col-span-2" placeholder="Short notes" value={doctorForm.notes || ''} onChange={e => setDoctorForm({ ...doctorForm, notes: e.target.value })} />
          <div className="availability-editor md:col-span-2">{days.map((day, index) => <div key={day}><b>{day}</b>{(availability[index] || []).map((range, rangeIndex) => <span key={`${day}-${rangeIndex}`}><input type="time" value={range.start_time} onChange={e => setAvailability(updateAvailability(availability, index, rangeIndex, 'start_time', e.target.value))} /><input type="time" value={range.end_time} onChange={e => setAvailability(updateAvailability(availability, index, rangeIndex, 'end_time', e.target.value))} /><button type="button" onClick={() => setAvailability(removeAvailability(availability, index, rangeIndex))}>Remove</button></span>)}<button type="button" onClick={() => setAvailability(addAvailability(availability, index))}>Add range</button></div>)}</div>
          <div className="form-actions md:col-span-2"><button className="btn border" type="button" onClick={() => { setDoctorForm(emptyDoctor); setAvailability({}); }}>Clear</button><button className="btn btn-primary" disabled={saving === 'doctor'}>{saving === 'doctor' ? 'Saving...' : 'Save Doctor'}</button></div>
        </form>
      </EmployeeSection>}
      {canManageDoctors && <EmployeeSection title="Blocked Dates" description="Block a full date or a specific unavailable time range.">
        <form className="block-form" onSubmit={addBlock}><select className="input" required value={blockForm.doctor_id} onChange={e => setBlockForm({ ...blockForm, doctor_id: e.target.value })}><option value="">Doctor</option>{doctors.map(doctor => <option value={doctor.id} key={doctor.id}>{doctor.doctor_name}</option>)}</select><input className="input" required type="date" value={blockForm.blocked_date} onChange={e => setBlockForm({ ...blockForm, blocked_date: e.target.value })} /><input className="input" type="time" value={blockForm.start_time} onChange={e => setBlockForm({ ...blockForm, start_time: e.target.value })} /><input className="input" type="time" value={blockForm.end_time} onChange={e => setBlockForm({ ...blockForm, end_time: e.target.value })} /><input className="input" placeholder="Reason" value={blockForm.reason} onChange={e => setBlockForm({ ...blockForm, reason: e.target.value })} /><button className="btn btn-primary" disabled={saving === 'block'}>Block</button></form>
        <div className="blocked-list">{doctors.flatMap(doctor => (doctor.blocked || []).map((block: any) => ({ ...block, doctor }))).map(block => <p key={block.id}><b>{block.doctor.doctor_name}</b><span>{fmtDate(block.blocked_date)} {block.start_time ? `${block.start_time.slice(0, 5)}-${block.end_time.slice(0, 5)}` : 'Full day'}</span>{canManageDoctors && <button type="button" onClick={async () => { await doctorSchedulingRepository.removeBlockedPeriod(block.id); await load(); }}>Remove</button>}</p>)}</div>
      </EmployeeSection>}
    </div>}

    {tab === 'Appointments' && <div className="doctor-two-column">
      <EmployeeSection title={reschedule ? 'Reschedule Appointment' : 'Create Appointment'} description="Select patient, doctor, date, then an available slot.">
        {canCreate || reschedule ? <form className="appointment-form" onSubmit={submitAppointment}>
          <select className="input" required value={appointmentForm.patient_id} disabled={!!reschedule} onChange={e => setAppointmentForm({ ...appointmentForm, patient_id: e.target.value })}><option value="">Select patient</option>{patients.map(patient => <option value={patient.id} key={patient.id}>{patient.full_name} {patient.patient_number ? `- ${patient.patient_number}` : ''}</option>)}</select>
          <select className="input" required value={appointmentForm.doctor_id} disabled={!!reschedule} onChange={e => setAppointmentForm({ ...appointmentForm, doctor_id: e.target.value, slot: '' })}><option value="">Select doctor</option>{doctors.filter(doctor => doctor.status === 'active' || doctor.id === appointmentForm.doctor_id).map(doctor => <option value={doctor.id} key={doctor.id}>{doctor.doctor_name} - {doctor.specialization}</option>)}</select>
          <input className="input" required type="date" value={appointmentForm.date} onChange={e => setAppointmentForm({ ...appointmentForm, date: e.target.value, slot: '' })} />
          <select className="input" value={appointmentForm.consultation_type} onChange={e => setAppointmentForm({ ...appointmentForm, consultation_type: e.target.value })}>{consultationTypes.map(type => <option value={type} key={type}>{label(type)}</option>)}</select>
          <div className="slot-picker">{currentDoctor ? slots.length ? slots.map(slot => <button type="button" className={appointmentForm.slot === slot.startAt ? 'active' : ''} onClick={() => setAppointmentForm({ ...appointmentForm, slot: slot.startAt })} key={slot.startAt}>{slot.label}</button>) : <p>No available slots for this doctor and date.</p> : <p>Select a doctor to view slots.</p>}</div>
          <textarea className="input" placeholder="Optional remarks" value={appointmentForm.remarks} onChange={e => setAppointmentForm({ ...appointmentForm, remarks: e.target.value })} />
          <div className="form-actions"><button type="button" className="btn border" onClick={() => setReschedule(null)}>Cancel</button><button className="btn btn-primary" disabled={saving === 'appointment'}>{saving === 'appointment' ? 'Saving...' : reschedule ? 'Reschedule' : 'Confirm Appointment'}</button></div>
        </form> : <EmployeeEmptyState title="Appointment creation unavailable" detail="You can view scheduling, but do not have appointment creation access." />}
      </EmployeeSection>
      <EmployeeSection title="Appointments" description="Upcoming, today, completed, cancelled, and no-show records.">
        <Filters doctors={doctors} patients={patients} doctorFilter={doctorFilter} setDoctorFilter={setDoctorFilter} patientFilter={patientFilter} setPatientFilter={setPatientFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
        <AppointmentGroups appointments={filteredAppointments} onOpen={setSelected} />
      </EmployeeSection>
    </div>}

    {selected && <AppointmentPanel appointment={selected} canUpdate={canUpdate} canCancel={canCancel} saving={saving === selected.id} onClose={() => setSelected(undefined)} onStatus={status => void changeStatus(selected, status)} onReschedule={() => startReschedule(selected)} />}
  </section>;
}

export function PatientAppointmentsSection({ patientId, scheduleBasePath = '/admin/doctor-scheduling' }: { patientId: string; scheduleBasePath?: string }) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const permissions = await doctorSchedulingRepository.permissions();
        setAllowed(permissions['doctor_scheduling.view']);
        setAppointments(permissions['doctor_scheduling.view'] ? await doctorSchedulingRepository.patientAppointments(patientId) : []);
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [patientId]);
  if (loading) return <p>Loading appointments...</p>;
  if (!allowed) return null;
  const upcoming = appointments.filter(item => new Date(item.start_at) >= new Date() && item.status !== 'cancelled');
  const previous = appointments.filter(item => new Date(item.start_at) < new Date() || item.status === 'cancelled');
  return <div className="space-y-4"><div className="flex justify-end"><Link className="btn btn-primary" href={`${scheduleBasePath}?patient=${patientId}`}>Schedule Appointment</Link></div><AppointmentMiniList title="Upcoming appointments" rows={upcoming} /><AppointmentMiniList title="Previous appointments" rows={previous} /></div>;
}

function AppointmentMiniList({ title, rows }: { title: string; rows: any[] }) {
  return <div className="card divide-y"><h3 className="p-4 text-sm font-bold">{title}</h3>{rows.length ? rows.map(item => <div className="p-4 text-sm" key={item.id}><b>{item.doctor?.doctor_name || 'Doctor'}</b><p>{fmtDate(item.start_at)} - {fmtTime(item.start_at)} to {fmtTime(item.end_at)}</p><EmployeeStatusBadge tone={statusTones[item.status as AppointmentStatus]}>{statusLabels[item.status as AppointmentStatus]}</EmployeeStatusBadge></div>) : <p className="p-4 text-sm text-slate-500">No appointments.</p>}</div>;
}

function Filters({ doctors, patients, doctorFilter, setDoctorFilter, patientFilter, setPatientFilter, statusFilter, setStatusFilter }: any) {
  return <div className="doctor-filters"><select className="input" value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}><option value="">All doctors</option>{doctors.map((doctor: any) => <option value={doctor.id} key={doctor.id}>{doctor.doctor_name}</option>)}</select><select className="input" value={patientFilter} onChange={e => setPatientFilter(e.target.value)}><option value="">All patients</option>{patients.map((patient: any) => <option value={patient.id} key={patient.id}>{patient.full_name}</option>)}</select><select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{appointmentStatuses.map(status => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></div>;
}

function AppointmentGroups({ appointments, onOpen }: { appointments: any[]; onOpen: (appointment: any) => void }) {
  const today = dateKey(new Date());
  const groups = [
    ['Today', appointments.filter(item => dateKey(new Date(item.start_at)) === today)],
    ['Upcoming', appointments.filter(item => new Date(item.start_at) > new Date() && !['completed', 'cancelled', 'no_show'].includes(item.status))],
    ['Completed', appointments.filter(item => item.status === 'completed')],
    ['Cancelled', appointments.filter(item => item.status === 'cancelled')],
  ] as const;
  return <div className="appointment-groups">{groups.map(([title, rows]) => <section key={title}><h3>{title}</h3>{rows.length ? rows.map(item => <button type="button" onClick={() => onOpen(item)} key={item.id}><span><b>{item.patient?.full_name || 'Patient'}</b><small>{fmtDate(item.start_at)} - {fmtTime(item.start_at)} - {item.doctor?.doctor_name || 'Doctor'}</small></span><EmployeeStatusBadge tone={statusTones[item.status as AppointmentStatus]}>{statusLabels[item.status as AppointmentStatus]}</EmployeeStatusBadge></button>) : <p>No appointments.</p>}</section>)}</div>;
}

function AppointmentPanel({ appointment, canUpdate, canCancel, saving, onClose, onStatus, onReschedule }: { appointment: any; canUpdate: boolean; canCancel: boolean; saving: boolean; onClose: () => void; onStatus: (status: AppointmentStatus) => void; onReschedule: () => void }) {
  return <div className="doctor-panel-backdrop"><aside className="doctor-panel"><header><div><h2>{appointment.patient?.full_name || 'Patient'}</h2><p>{appointment.doctor?.doctor_name || 'Doctor'} - {fmtDate(appointment.start_at)}</p></div><button type="button" onClick={onClose}>Close</button></header><dl><div><dt>Time</dt><dd>{fmtTime(appointment.start_at)} to {fmtTime(appointment.end_at)}</dd></div><div><dt>Consultation</dt><dd>{label(appointment.consultation_type)}</dd></div><div><dt>Status</dt><dd><EmployeeStatusBadge tone={statusTones[appointment.status as AppointmentStatus]}>{statusLabels[appointment.status as AppointmentStatus]}</EmployeeStatusBadge></dd></div><div><dt>Remarks</dt><dd>{appointment.remarks || '-'}</dd></div></dl><div className="panel-actions">{canUpdate && <button disabled={saving} type="button" onClick={() => onStatus('confirmed')}>Confirm</button>}{canUpdate && <button disabled={saving} type="button" onClick={onReschedule}>Reschedule</button>}{canUpdate && <button disabled={saving} type="button" onClick={() => onStatus('completed')}>Completed</button>}{canUpdate && <button disabled={saving} type="button" onClick={() => onStatus('no_show')}>No Show</button>}{canCancel && <button disabled={saving} type="button" className="danger" onClick={() => onStatus('cancelled')}>Cancel</button>}</div></aside></div>;
}

function daysForView(cursor: string, view: 'day' | 'week' | 'month') {
  const start = new Date(`${cursor}T00:00:00`);
  if (view === 'day') return [start];
  if (view === 'week') {
    const weekStart = addDays(start, -start.getDay());
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  return Array.from({ length: new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate() }, (_, index) => addDays(monthStart, index));
}

function addAvailability(current: Record<number, { start_time: string; end_time: string }[]>, day: number) {
  return { ...current, [day]: [...(current[day] || []), { start_time: '09:00', end_time: '12:00' }] };
}
function updateAvailability(current: Record<number, { start_time: string; end_time: string }[]>, day: number, index: number, field: 'start_time' | 'end_time', value: string) {
  return { ...current, [day]: (current[day] || []).map((range, rangeIndex) => rangeIndex === index ? { ...range, [field]: value } : range) };
}
function removeAvailability(current: Record<number, { start_time: string; end_time: string }[]>, day: number, index: number) {
  return { ...current, [day]: (current[day] || []).filter((_, rangeIndex) => rangeIndex !== index) };
}
