'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { currentProfile } from '@/lib/auth';
import { doctorSchedulingRepository, type DoctorPayload } from '@/lib/doctor-scheduling-repository';
import { appointmentStatuses, consultationTypes, statusLabels, statusTones, type AppointmentStatus, validateAvailabilityRanges, validateDoctorPayload } from '@/lib/doctor-scheduling-rules';
import { EmployeeBanner, EmployeeEmptyState, EmployeeLoading, EmployeeMetric, EmployeeMetricGrid, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { BUSINESS_TIME_ZONE } from '@/lib/business-time';
import { clinicianLifecycleError } from '@/lib/clinician-lifecycle';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const emptyDoctor: DoctorPayload = { doctor_name: '', specialization: '', qualification: '', phone: '', email: '', consultation_duration_minutes: 30, status: 'active', notes: '', clinician_type: 'outsourced', profile_id: null, photo_url: '' };

const dateKey = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const addDays = (value: Date, daysToAdd: number) => { const next = new Date(value); next.setDate(next.getDate() + daysToAdd); return next; };
const fmtDate = (value: string | Date) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const fmtTime = (value: string | Date) => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const can = (permissions: Record<string, boolean>, ...codes: string[]) => codes.some(code => permissions[code]);
const clinicianDesignation = (clinician: any) => clinician.qualification || clinician.specialization || 'Psychologist';
const clinicianOption = (clinician: any) => `${clinician.doctor_name} - ${clinicianDesignation(clinician)}`;
function ClinicianAvatar({ clinician }: { clinician: any }) {
  const [failed, setFailed] = useState(false);
  const initials = String(clinician.doctor_name || 'C').split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase();
  return clinician.photo_url && !failed
    ? <img className="clinician-avatar" src={clinician.photo_url} alt={`${clinician.doctor_name} profile`} onError={() => setFailed(true)} />
    : <span className="clinician-avatar clinician-avatar-fallback" aria-label={`${clinician.doctor_name} initials`}>{initials}</span>;
}

export function DoctorSchedulingPage({ initialPatientId, initialAppointmentId, workspace = 'employee' }: { initialPatientId?: string; initialAppointmentId?: string; workspace?: 'admin' | 'employee' | 'clinician' }) {
  const [profile, setProfile] = useState<any>();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [doctors, setDoctors] = useState<any[]>([]);
  const [inactiveDoctors, setInactiveDoctors] = useState<any[]>([]);
  const [clinicianList, setClinicianList] = useState<'active' | 'inactive'>('active');
  const [removeCandidate, setRemoveCandidate] = useState<any>();
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
  const [doctorFormOpen, setDoctorFormOpen] = useState(false);
  const [availability, setAvailability] = useState<Record<number, { start_time: string; end_time: string }[]>>({});
  const [doctorFormErrors, setDoctorFormErrors] = useState<Record<string, string>>({});
  const [blockForm, setBlockForm] = useState({ doctor_id: '', blocked_date: dateKey(new Date()), start_time: '', end_time: '', reason: '' });
  const [appointmentForm, setAppointmentForm] = useState({ patient_id: initialPatientId || '', doctor_id: '', date: dateKey(new Date()), slot: '', consultation_type: 'in_person', remarks: '' });
  const [slots, setSlots] = useState<any[]>([]);
  const [reschedule, setReschedule] = useState<any>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const handledInitialAppointment = useRef(false);

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
      if (!handledInitialAppointment.current && initialAppointmentId) {
        handledInitialAppointment.current = true;
        const appointment = appointmentRows.find((item: any) => item.id === initialAppointmentId);
        if (appointment) {
          setSelected(appointment);
          setTab('Schedule');
          setCursor(dateKey(new Date(appointment.start_at)));
        }
      }
      setError('');
    } catch (caught: any) {
      setError(caught.message || 'Unable to load Appointment & Scheduling.');
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
  const canManageAllAvailability = permissions['clinician.availability.manage_all'];
  const canManageOwnAvailability = permissions['clinician.availability.manage_own'];
  const ownClinician = doctors.find(item => item.profile_id === profile?.id);
  const manageableDoctors = canManageDoctors || canManageAllAvailability ? doctors : ownClinician ? [ownClinician] : [];
  const canManageAvailability = canManageDoctors || canManageAllAvailability || Boolean(ownClinician && canManageOwnAvailability);
  const canCreate = can(permissions, 'doctor_scheduling.create_appointments', 'appointments.create');
  const canUpdate = can(permissions, 'doctor_scheduling.update_appointments', 'appointments.update', 'appointments.update_status', 'appointments.reschedule');
  const canCancel = can(permissions, 'doctor_scheduling.cancel_appointments', 'appointments.cancel');
  const filteredAppointments = useMemo(() => appointments.filter(item => (!doctorFilter || item.doctor_id === doctorFilter) && (!patientFilter || item.patient_id === patientFilter) && (!statusFilter || item.status === statusFilter)), [appointments, doctorFilter, patientFilter, statusFilter]);
  const visibleDays = useMemo(() => daysForView(cursor, view), [cursor, view]);
  const currentDoctor = doctors.find(item => item.id === appointmentForm.doctor_id);

  const editDoctor = (doctor: any) => {
    setDoctorForm({ id: doctor.id, doctor_name: doctor.doctor_name, specialization: doctor.specialization, qualification: doctor.qualification, phone: doctor.phone, email: doctor.email || '', consultation_duration_minutes: doctor.consultation_duration_minutes, status: doctor.status, notes: doctor.notes || '', clinician_type: doctor.clinician_type || 'outsourced', profile_id: doctor.profile_id || null, photo_url: doctor.photo_url || '' });
    const grouped: Record<number, { start_time: string; end_time: string }[]> = {};
    for (const range of doctor.availability || []) grouped[range.day_of_week] = [...(grouped[range.day_of_week] || []), { start_time: range.start_time.slice(0, 5), end_time: range.end_time.slice(0, 5) }];
    setAvailability(grouped);
    setDoctorFormErrors({});
    setDoctorFormOpen(true);
  };

  const startDoctor = () => { setDoctorForm(emptyDoctor); setAvailability({}); setDoctorFormErrors({}); setError(''); setNotice(''); setDoctorFormOpen(true); };

  const clearDoctorFormError = (field: string) => setDoctorFormErrors(current => {
    if (!current[field] && !current._form) return current;
    const next = { ...current };
    delete next[field];
    delete next._form;
    return next;
  });

  const doctorErrorFields = (message: string): Record<string, string> => {
    if (message === 'Psychologist name is required.') return { doctor_name: 'Psychologist name is required.' };
    if (message === 'Specialization is required.') return { specialization: message };
    if (message === 'Qualification is required.') return { qualification: message };
    if (message === 'Phone number is required.') return { phone: message };
    if (message === 'Enter a valid email address.' || message.includes('outsourced_doctors_email_format')) return { email: 'Enter a valid email address.' };
    if (message.includes('Consultation duration')) return { consultation_duration_minutes: message };
    if (message.includes('Notes must')) return { notes: message };
    if (message.includes('availability') || message.includes('time') || message.includes('range') || message.includes('overlap')) return { availability: message };
    if (/duplicate|unique|already exists/i.test(message)) return { email: 'A clinician with this email already exists.' };
    return { _form: "We couldn't add this clinician. Please review the details and try again." };
  };

  const saveDoctor = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setError(''); setNotice(''); setDoctorFormErrors({});
    const formError = canManageDoctors ? validateDoctorPayload(doctorForm) : null;
    if (formError) {
      setDoctorFormErrors(doctorErrorFields(formError));
      return;
    }
    const ranges = Object.entries(availability).flatMap(([day, rows]) => rows.map(row => ({ day_of_week: Number(day), start_time: row.start_time, end_time: row.end_time })));
    const availabilityError = validateAvailabilityRanges(ranges, Number(doctorForm.consultation_duration_minutes));
    if (availabilityError) {
      setDoctorFormErrors({ availability: availabilityError });
      return;
    }
    setSaving('doctor');
    try {
      const doctor = canManageDoctors
        ? await doctorSchedulingRepository.saveDoctor({ ...doctorForm, consultation_duration_minutes: Number(doctorForm.consultation_duration_minutes), actorId: profile.id })
        : manageableDoctors.find(item => item.id === doctorForm.id) || null;
      if (!doctor) throw new Error('You do not have permission to update this availability.');
      await doctorSchedulingRepository.replaceAvailability(doctor.id, profile.id, ranges, Number(doctorForm.consultation_duration_minutes));
      setDoctorForm(emptyDoctor);
      setAvailability({});
      setDoctorFormOpen(false);
      setNotice(canManageDoctors ? 'Clinician profile and availability saved.' : 'Clinician availability saved.');
      await load();
    } catch (caught: any) {
      const message = caught.message || 'Unable to save psychologist.';
      setDoctorFormErrors(doctorErrorFields(message));
    } finally {
      setSaving('');
    }
  };

  const loadInactiveDoctors = async () => {
    try { setInactiveDoctors((await doctorSchedulingRepository.doctors(true)).filter((doctor: any) => doctor.archived_at)); }
    catch (caught: any) { setError(caught.message || 'Unable to load inactive clinicians.'); }
  };

  const removeDoctor = async () => {
    const doctor = removeCandidate;
    if (!doctor) return;
    setSaving(doctor.id); setError(''); setNotice('');
    try {
      await doctorSchedulingRepository.setClinicianActive(doctor.id, false);
      setRemoveCandidate(undefined);
      setNotice('Clinician removed successfully. Historical appointments and payments were preserved.');
      await load();
    } catch (caught: unknown) {
      console.error('Unable to remove clinician', caught);
      setError(clinicianLifecycleError(caught));
    } finally {
      setSaving('');
    }
  };

  const restoreDoctor = async (doctor: any) => {
    setSaving(doctor.id); setError(''); setNotice('');
    try {
      await doctorSchedulingRepository.setClinicianActive(doctor.id, true);
      setNotice('Clinician restored successfully.');
      await Promise.all([load(), loadInactiveDoctors()]);
    } catch (caught: unknown) {
      console.error('Unable to restore clinician', caught);
      setError(clinicianLifecycleError(caught));
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

  if (loading) return <section><EmployeePageHeader title="Appointment & Scheduling" subtitle="Shared psychologist availability and appointments." /><EmployeeLoading cards={4} /></section>;

  return <section className="doctor-scheduling">
    <EmployeePageHeader title={workspace === 'clinician' ? 'My Schedule' : 'Appointment & Scheduling'} subtitle={workspace === 'clinician' ? 'Manage your availability and view your assigned appointments.' : 'Manage staff and outsourced psychologist availability and appointments together.'} action={canCreate ? <button className="btn btn-primary" type="button" onClick={() => setTab('Appointments')}>Create Appointment</button> : undefined} />
    {error && <EmployeeBanner>{error}</EmployeeBanner>}{notice && <EmployeeBanner tone="success">{notice}</EmployeeBanner>}
    <EmployeeMetricGrid columns={4}><EmployeeMetric label="Appointments today" value={summary?.today || 0} /><EmployeeMetric label="Upcoming" value={summary?.upcoming || 0} tone="info" /><EmployeeMetric label="Available psychologists today" value={summary?.availableDoctorsToday || 0} tone="success" /><EmployeeMetric label="Cancelled or rescheduled" value={summary?.changed || 0} tone="pending" /></EmployeeMetricGrid>
    <div className="doctor-tabs">{(['Schedule', 'Doctors', 'Appointments'] as const).map(item => <button type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item === 'Doctors' ? (workspace === 'clinician' ? 'My Availability' : 'Clinicians') : item}</button>)}</div>

    {tab === 'Schedule' && <EmployeeSection title="Schedule" description="Day, week, and month views collapse into an agenda on mobile.">
      <Filters doctors={doctors} patients={patients} doctorFilter={doctorFilter} setDoctorFilter={setDoctorFilter} patientFilter={patientFilter} setPatientFilter={setPatientFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
      <div className="schedule-toolbar"><div>{(['day', 'week', 'month'] as const).map(item => <button type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)} key={item}>{label(item)}</button>)}</div><div><button type="button" onClick={() => setCursor(dateKey(addDays(new Date(cursor), view === 'month' ? -30 : view === 'week' ? -7 : -1)))}>Previous</button><button type="button" onClick={() => setCursor(dateKey(new Date()))}>Today</button><button type="button" onClick={() => setCursor(dateKey(addDays(new Date(cursor), view === 'month' ? 30 : view === 'week' ? 7 : 1)))}>Next</button></div></div>
      <div className={`schedule-grid schedule-${view}`}>{visibleDays.map(day => { const key = dateKey(day); const rows = filteredAppointments.filter(item => dateKey(new Date(item.start_at)) === key); return <section className="schedule-day" key={key}><header><b>{view === 'month' ? day.getDate() : fmtDate(day)}</b><small>{shortDays[day.getDay()]}</small></header>{rows.length ? rows.map(item => <button className="appointment-card" type="button" onClick={() => setSelected(item)} key={item.id}><time>{fmtTime(item.start_at)}</time><b>{item.patient?.full_name || 'Client'}</b><small>{item.doctor?.doctor_name || 'Psychologist'}</small><EmployeeStatusBadge tone={statusTones[item.status as AppointmentStatus]}>{statusLabels[item.status as AppointmentStatus]}</EmployeeStatusBadge></button>) : <p className="schedule-empty">No appointments</p>}</section>; })}</div>
    </EmployeeSection>}

    {tab === 'Doctors' && <div className="doctor-two-column">
      <EmployeeSection title={workspace === 'clinician' ? 'My Availability' : 'Clinicians'} description="Staff, interns, and outsourced psychologists share the same scheduling calendar." action={canManageDoctors ? <button className="btn btn-primary" type="button" onClick={startDoctor}>Add Clinician</button> : undefined}>
        {canManageDoctors && <div className="clinician-list-tabs" role="tablist" aria-label="Clinician status"><button className={clinicianList === 'active' ? 'active' : ''} type="button" role="tab" aria-selected={clinicianList === 'active'} onClick={() => setClinicianList('active')}>Active</button><button className={clinicianList === 'inactive' ? 'active' : ''} type="button" role="tab" aria-selected={clinicianList === 'inactive'} onClick={() => { setClinicianList('inactive'); void loadInactiveDoctors(); }}>Inactive</button></div>}
        {(clinicianList === 'active' ? doctors : inactiveDoctors).length ? <div className="doctor-list">{(clinicianList === 'active' ? doctors : inactiveDoctors).map(doctor => { const canEditAvailability = !doctor.archived_at && (canManageDoctors || canManageAllAvailability || (canManageOwnAvailability && doctor.profile_id === profile?.id)); const inactive = Boolean(doctor.archived_at); return <article key={doctor.id}><ClinicianAvatar clinician={doctor} /><div><b>{doctor.doctor_name}</b><small>{clinicianDesignation(doctor)}</small><small>{label(doctor.clinician_type || 'outsourced')} · {doctor.consultation_duration_minutes} min</small><small>{availabilitySummary(doctor.availability || [])}</small></div><EmployeeStatusBadge tone={inactive ? 'danger' : doctor.status === 'active' ? 'success' : 'danger'}>{inactive ? 'Inactive' : 'Active'}</EmployeeStatusBadge>{(canEditAvailability || canManageDoctors) && <div className="doctor-actions">{canEditAvailability && <button className="btn border" type="button" onClick={() => editDoctor(doctor)}>Edit availability</button>}{canManageDoctors && <details className="clinician-action-menu"><summary aria-label={`Actions for ${doctor.doctor_name}`}>⋮</summary><div><button className="btn border" type="button" onClick={() => editDoctor(doctor)}>Edit Clinician</button>{inactive ? <button className="btn border" type="button" disabled={saving === doctor.id} onClick={() => void restoreDoctor(doctor)}>Restore Clinician</button> : <button className="btn border clinician-remove" type="button" disabled={saving === doctor.id} onClick={() => setRemoveCandidate(doctor)}>Remove Clinician</button>}</div></details>}</div>}</article>; })}</div> : <div className="doctor-empty"><EmployeeEmptyState title={clinicianList === 'inactive' ? 'No inactive clinicians' : 'No clinicians available'} detail={clinicianList === 'inactive' ? 'Removed clinicians can be restored here.' : 'A scheduling manager can add an external clinician record; an account is only needed for internal clinician self-service.'} />{canManageDoctors && clinicianList === 'active' && <button className="btn btn-primary" type="button" onClick={startDoctor}>Add First Clinician</button>}</div>}
      </EmployeeSection>
      {canManageAvailability && <EmployeeSection title="Blocked Dates" description="Block a future full date or a specific unavailable time range.">
        <form className="block-form" onSubmit={addBlock}>
          <label className="block-field">Clinician<select aria-label="Clinician to block" className="input" required value={blockForm.doctor_id} onChange={e => setBlockForm({ ...blockForm, doctor_id: e.target.value })}><option value="">Select clinician</option>{manageableDoctors.map(doctor => <option value={doctor.id} key={doctor.id}>{doctor.doctor_name}</option>)}</select></label>
          <label className="block-field">Date<input aria-label="Blocked date" className="input" required type="date" value={blockForm.blocked_date} onChange={e => setBlockForm({ ...blockForm, blocked_date: e.target.value })} /></label>
          <div className="block-time-range"><label className="block-field">Start time<input aria-label="Blocked start time" className="input" type="time" value={blockForm.start_time} onChange={e => setBlockForm({ ...blockForm, start_time: e.target.value })} /></label><label className="block-field">End time<input aria-label="Blocked end time" className="input" type="time" value={blockForm.end_time} onChange={e => setBlockForm({ ...blockForm, end_time: e.target.value })} /></label></div>
          <label className="block-field block-reason">Reason <span>(optional)</span><input className="input" placeholder="e.g. Leave or clinic closure" value={blockForm.reason} onChange={e => setBlockForm({ ...blockForm, reason: e.target.value })} /></label>
          <button className="btn btn-primary block-submit" disabled={saving === 'block'}>{saving === 'block' ? 'Blocking...' : 'Block date'}</button>
        </form>
        <div className="blocked-list">{manageableDoctors.flatMap(doctor => (doctor.blocked || []).map((block: any) => ({ ...block, doctor }))).map(block => <article key={block.id}><div><b>{block.doctor.doctor_name}</b><small>{fmtDate(block.blocked_date)} · {block.start_time ? `${block.start_time.slice(0, 5)} to ${block.end_time.slice(0, 5)}` : 'Full day'}</small>{block.reason && <small>{block.reason}</small>}</div>{(canManageDoctors || canManageAllAvailability || block.doctor.profile_id === profile?.id) && <button type="button" onClick={async () => { await doctorSchedulingRepository.removeBlockedPeriod(block.id); await load(); }}>Remove</button>}</article>)}{!manageableDoctors.some(doctor => doctor.blocked?.length) && <p className="blocked-empty">No blocked dates yet.</p>}</div>
      </EmployeeSection>}
    </div>}
    {tab === 'Doctors' && canManageAvailability && doctorFormOpen && <DoctorEditor form={doctorForm} availability={availability} errors={doctorFormErrors} saving={saving === 'doctor'} readOnlyIdentity={!canManageDoctors} onChange={setDoctorForm} onClearError={clearDoctorFormError} onAvailabilityChange={setAvailability} onClose={() => { setDoctorFormErrors({}); setDoctorFormOpen(false); }} onSubmit={saveDoctor} />}

    {tab === 'Appointments' && <div className="doctor-two-column">
      <EmployeeSection title={reschedule ? 'Reschedule Appointment' : 'Create Appointment'} description="Select client, psychologist, date, then an available slot.">
        {canCreate || reschedule ? <form className="appointment-form" onSubmit={submitAppointment}>
          <select className="input" required value={appointmentForm.patient_id} disabled={!!reschedule} onChange={e => setAppointmentForm({ ...appointmentForm, patient_id: e.target.value })}><option value="">Select client</option>{patients.map(patient => <option value={patient.id} key={patient.id}>{patient.full_name} {patient.patient_number ? `- ${patient.patient_number}` : ''}</option>)}</select>
          <select className="input" required value={appointmentForm.doctor_id} disabled={!!reschedule} onChange={e => setAppointmentForm({ ...appointmentForm, doctor_id: e.target.value, slot: '' })}><option value="">Select psychologist</option>{doctors.filter(doctor => doctor.status === 'active' || doctor.id === appointmentForm.doctor_id).map(doctor => <option value={doctor.id} key={doctor.id}>{clinicianOption(doctor)}</option>)}</select>
          <input className="input" required type="date" value={appointmentForm.date} onChange={e => setAppointmentForm({ ...appointmentForm, date: e.target.value, slot: '' })} />
          <select className="input" value={appointmentForm.consultation_type} onChange={e => setAppointmentForm({ ...appointmentForm, consultation_type: e.target.value })}>{consultationTypes.map(type => <option value={type} key={type}>{label(type)}</option>)}</select>
          <div className="slot-picker">{currentDoctor ? slots.length ? slots.map(slot => <button type="button" className={appointmentForm.slot === slot.startAt ? 'active' : ''} onClick={() => setAppointmentForm({ ...appointmentForm, slot: slot.startAt })} key={slot.startAt}>{slot.label}</button>) : <p>No available slots for this psychologist and date.</p> : <p>Select a psychologist to view slots.</p>}</div>
          <textarea className="input" placeholder="Optional remarks" value={appointmentForm.remarks} onChange={e => setAppointmentForm({ ...appointmentForm, remarks: e.target.value })} />
          <div className="form-actions"><button type="button" className="btn border" onClick={() => setReschedule(null)}>Cancel</button><button className="btn btn-primary" disabled={saving === 'appointment'}>{saving === 'appointment' ? 'Saving...' : reschedule ? 'Reschedule' : 'Confirm Appointment'}</button></div>
        </form> : <EmployeeEmptyState title="Appointment creation unavailable" detail="You can view scheduling, but do not have appointment creation access." />}
      </EmployeeSection>
      <EmployeeSection title="Appointments" description="Upcoming, today, completed, cancelled, and no-show records.">
        <Filters doctors={doctors} patients={patients} doctorFilter={doctorFilter} setDoctorFilter={setDoctorFilter} patientFilter={patientFilter} setPatientFilter={setPatientFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
        <AppointmentGroups appointments={filteredAppointments} onOpen={setSelected} />
      </EmployeeSection>
    </div>}

    <ConfirmationDialog open={!!removeCandidate} title="Remove clinician?" description={`Are you sure you want to remove ${removeCandidate?.doctor_name || 'this clinician'} from the active clinician list? Historical appointments and payments will be preserved.`} confirmLabel="Remove Clinician" destructive pending={saving === removeCandidate?.id} error={error} onClose={() => { if (saving !== removeCandidate?.id) setRemoveCandidate(undefined); }} onConfirm={removeDoctor} />
    {selected && <AppointmentPanel appointment={selected} canUpdate={canUpdate} canCancel={canCancel} saving={saving === selected.id} onClose={() => setSelected(undefined)} onStatus={status => void changeStatus(selected, status)} onReschedule={() => startReschedule(selected)} />}
  </section>;
}

export function PatientAppointmentsSection({ patientId, scheduleBasePath = '/admin/doctor-scheduling' }: { patientId: string; scheduleBasePath?: string }) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit' | 'reschedule'>('create');
  const [editing, setEditing] = useState<any>();
  const [form, setForm] = useState({ doctor_id: '', date: dateKey(new Date()), slot: '', consultation_type: 'in_person', status: 'scheduled', remarks: '' });
  const [slots, setSlots] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [loading, setLoading] = useState(true);

  const loadPatientAppointments = useCallback(async () => {
    try {
      const nextPermissions = await doctorSchedulingRepository.permissions();
      const viewAllowed = can(nextPermissions, 'doctor_scheduling.view', 'appointments.view');
      setPermissions(nextPermissions);
      setAllowed(viewAllowed);
      if (viewAllowed) {
        const [appointmentRows, doctorRows] = await Promise.all([
          doctorSchedulingRepository.patientAppointments(patientId),
          doctorSchedulingRepository.doctors(),
        ]);
        setAppointments(appointmentRows);
        setDoctors(doctorRows);
      }
    } catch (caught: any) {
      setError(caught.message || 'Unable to load appointments.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadPatientAppointments(), 0);
    return () => clearTimeout(timer);
  }, [loadPatientAppointments]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!form.doctor_id || !form.date) { setSlots([]); return; }
      try {
        setSlots(await doctorSchedulingRepository.slots(form.doctor_id, form.date, editing?.id));
      } catch {
        setSlots([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [form.doctor_id, form.date, editing?.id]);

  const openForm = (nextMode: 'create' | 'edit' | 'reschedule', appointment?: any) => {
    setMode(nextMode);
    setEditing(appointment);
    setForm({
      doctor_id: appointment?.doctor_id || '',
      date: appointment ? dateKey(new Date(appointment.start_at)) : dateKey(new Date()),
      slot: appointment?.start_at ? new Date(appointment.start_at).toISOString() : '',
      consultation_type: appointment?.consultation_type || 'in_person',
      status: appointment?.status || 'scheduled',
      remarks: appointment?.remarks || '',
    });
    setError('');
    setNotice('');
    setFormOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const slot = slots.find(item => item.startAt === form.slot);
    if (!slot) { setError('Choose an available slot.'); return; }
    setSaving('form'); setError(''); setNotice('');
    try {
      if (mode === 'create') {
        const created = await doctorSchedulingRepository.createAppointment({ patientId, doctorId: form.doctor_id, startAt: slot.startAt, endAt: slot.endAt, consultationType: form.consultation_type as any, remarks: form.remarks });
        if (form.status !== 'scheduled') await doctorSchedulingRepository.setAppointmentStatus(created, form.status as AppointmentStatus, form.remarks);
        setNotice('Appointment scheduled.');
      } else if (mode === 'reschedule') {
        await doctorSchedulingRepository.rescheduleAppointment(editing.id, slot.startAt, slot.endAt, form.remarks);
        setNotice('Appointment rescheduled.');
      } else {
        await doctorSchedulingRepository.updateAppointment({ id: editing.id, doctorId: form.doctor_id, startAt: slot.startAt, endAt: slot.endAt, consultationType: form.consultation_type as any, status: form.status as AppointmentStatus, remarks: form.remarks });
        setNotice('Appointment updated.');
      }
      setFormOpen(false);
      await loadPatientAppointments();
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
      await loadPatientAppointments();
    } catch (caught: any) {
      setError(caught.message || 'Unable to update appointment.');
    } finally {
      setSaving('');
    }
  };

  const deleteAppointment = async (appointment: any) => {
    if (!confirm('Delete this appointment from active scheduling? It will stay in appointment activity history.')) return;
    setSaving(appointment.id); setError(''); setNotice('');
    try {
      await doctorSchedulingRepository.deleteAppointment(appointment.id);
      setNotice('Appointment deleted.');
      await loadPatientAppointments();
    } catch (caught: any) {
      setError(caught.message || 'Unable to delete appointment.');
    } finally {
      setSaving('');
    }
  };

  if (loading) return <p>Loading appointments...</p>;
  if (!allowed) return <EmployeeEmptyState title="Appointments unavailable" detail="You do not have access to this client's appointments." />;

  const canCreate = can(permissions, 'doctor_scheduling.create_appointments', 'appointments.create');
  const canUpdate = can(permissions, 'doctor_scheduling.update_appointments', 'appointments.update');
  const canReschedule = can(permissions, 'doctor_scheduling.update_appointments', 'appointments.reschedule');
  const canCancel = can(permissions, 'doctor_scheduling.cancel_appointments', 'appointments.cancel');
  const canUpdateStatus = can(permissions, 'doctor_scheduling.update_appointments', 'appointments.update_status');
  const canDelete = can(permissions, 'appointments.delete');
  const upcoming = appointments.filter(item => new Date(item.start_at) >= new Date() && !['cancelled', 'completed', 'no_show'].includes(item.status)).sort((a, b) => new Date(a.start_at).valueOf() - new Date(b.start_at).valueOf());
  const previous = appointments.filter(item => new Date(item.start_at) < new Date() || ['cancelled', 'completed', 'no_show'].includes(item.status)).sort((a, b) => new Date(b.start_at).valueOf() - new Date(a.start_at).valueOf());
  const selectedDoctor = doctors.find(doctor => doctor.id === form.doctor_id);

  return <div className="patient-appointments space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Appointments</h2>{canCreate && <button className="btn btn-primary" type="button" onClick={() => openForm('create')}>Schedule Appointment</button>}</div>
    {error && <EmployeeBanner>{error}</EmployeeBanner>}{notice && <EmployeeBanner tone="success">{notice}</EmployeeBanner>}
    {!appointments.length && <div className="patient-appointment-empty"><EmployeeEmptyState title="No appointments have been scheduled for this client yet." detail="Create the first psychologist appointment from this client profile." />{canCreate && <button className="btn btn-primary" type="button" onClick={() => openForm('create')}>Schedule First Appointment</button>}</div>}
    {formOpen && <div className="patient-appointment-drawer" role="dialog" aria-modal="true" aria-label={mode === 'create' ? 'Schedule appointment' : mode === 'edit' ? 'Edit appointment' : 'Reschedule appointment'}>
      <form className="patient-appointment-form" onSubmit={submit}>
        <header><div><h3>{mode === 'create' ? 'Schedule Appointment' : mode === 'edit' ? 'Edit Appointment' : 'Reschedule Appointment'}</h3><p>Client is preselected from this profile.</p></div><button type="button" onClick={() => setFormOpen(false)}>Close</button></header>
        <label>Client<input className="input" value="Current client" readOnly /></label>
        <label>Psychologist<select className="input" required value={form.doctor_id} onChange={event => setForm({ ...form, doctor_id: event.target.value, slot: '' })}><option value="">Select psychologist</option>{doctors.filter(doctor => doctor.status === 'active' || doctor.id === form.doctor_id).map(doctor => <option value={doctor.id} key={doctor.id}>{clinicianOption(doctor)}</option>)}</select></label>
        <label>Appointment date<input className="input" required type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value, slot: '' })} /></label>
        <label>Consultation type<select className="input" value={form.consultation_type} onChange={event => setForm({ ...form, consultation_type: event.target.value })}>{consultationTypes.map(type => <option value={type} key={type}>{label(type)}</option>)}</select></label>
        <label>Status<select className="input" value={form.status} disabled={mode === 'reschedule'} onChange={event => setForm({ ...form, status: event.target.value })}>{appointmentStatuses.map(status => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
        <div><b className="text-sm">Available time slot</b><div className="slot-picker">{selectedDoctor ? slots.length ? slots.map(slot => <button type="button" className={form.slot === slot.startAt ? 'active' : ''} onClick={() => setForm({ ...form, slot: slot.startAt })} key={slot.startAt}>{slot.label}</button>) : <p>No available slots for this psychologist and date.</p> : <p>Select a psychologist to view slots.</p>}</div></div>
        <label>Remarks<textarea className="input" value={form.remarks} onChange={event => setForm({ ...form, remarks: event.target.value })} placeholder="Optional short remarks" /></label>
        <div className="form-actions"><button type="button" className="btn border" onClick={() => setFormOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={saving === 'form'}>{saving === 'form' ? 'Saving...' : 'Save'}</button></div>
      </form>
    </div>}
    <AppointmentMiniList title="Upcoming appointments" rows={upcoming} actions={{ canUpdate, canReschedule, canCancel, canUpdateStatus, canDelete, saving, openForm, changeStatus, deleteAppointment }} />
    <AppointmentMiniList title="Previous appointments" rows={previous} actions={{ canUpdate, canReschedule, canCancel, canUpdateStatus, canDelete, saving, openForm, changeStatus, deleteAppointment }} />
    <Link className="text-sm font-semibold text-teal-700" href={`${scheduleBasePath}?patient=${patientId}`}>Open Appointment & Scheduling</Link>
  </div>;
}

function AppointmentMiniList({ title, rows, actions }: { title: string; rows: any[]; actions?: any }) {
  return <div className="card divide-y"><h3 className="p-4 text-sm font-bold">{title}</h3>{rows.length ? rows.map(item => <div className="patient-appointment-card p-4 text-sm" key={item.id}><div><b>{fmtDate(item.start_at)}</b><p>{fmtTime(item.start_at)} to {fmtTime(item.end_at)} - {item.doctor?.doctor_name || 'Doctor'}</p><small>{item.doctor?.specialization || 'Specialization'} - {label(item.consultation_type)}</small>{item.remarks && <small>{item.remarks}</small>}</div><EmployeeStatusBadge tone={statusTones[item.status as AppointmentStatus]}>{statusLabels[item.status as AppointmentStatus]}</EmployeeStatusBadge>{actions && <div className="patient-appointment-actions">{actions.canUpdate && <button type="button" onClick={() => actions.openForm('edit', item)} disabled={actions.saving === item.id}>Edit</button>}{actions.canReschedule && <button type="button" onClick={() => actions.openForm('reschedule', item)} disabled={actions.saving === item.id}>Reschedule</button>}{actions.canUpdateStatus && <button type="button" onClick={() => actions.changeStatus(item, 'confirmed')} disabled={actions.saving === item.id}>Confirm</button>}{actions.canUpdateStatus && <button type="button" onClick={() => actions.changeStatus(item, 'completed')} disabled={actions.saving === item.id}>Complete</button>}{actions.canUpdateStatus && <button type="button" onClick={() => actions.changeStatus(item, 'no_show')} disabled={actions.saving === item.id}>No Show</button>}{actions.canCancel && <button type="button" onClick={() => actions.changeStatus(item, 'cancelled')} disabled={actions.saving === item.id}>Cancel</button>}{actions.canDelete && <button type="button" className="danger" onClick={() => actions.deleteAppointment(item)} disabled={actions.saving === item.id}>Delete</button>}</div>}</div>) : <p className="p-4 text-sm text-slate-500">No appointments.</p>}</div>;
}

function DoctorFieldError({ errors, name }: { errors: Record<string, string>; name: string }) {
  return errors?.[name] ? <small className="field-error" id={`doctor-${name}-error`}>{errors[name]}</small> : null;
}

function DoctorEditor({ form, availability, errors, saving, readOnlyIdentity, onChange, onClearError, onAvailabilityChange, onClose, onSubmit }: any) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorKeys = Object.keys(errors || {});

  useEffect(() => {
    if (!errorKeys.length) return;
    const timer = window.setTimeout(() => {
      const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [errors, errorKeys.length]);

  const field = (key: string, value: any) => {
    onChange({ ...form, [key]: value });
    onClearError(key);
  };
  const errorProps = (key: string) => ({
    'aria-describedby': errors?.[key] ? `doctor-${key}-error` : undefined,
    'aria-invalid': errors?.[key] ? true : undefined,
    className: `input${errors?.[key] ? ' input-error' : ''}`,
  });

  return <div className="doctor-editor-backdrop" role="dialog" aria-modal="true" aria-label={form.id ? 'Edit psychologist' : 'Add psychologist'}>
    <form className="doctor-editor" noValidate onSubmit={onSubmit} ref={formRef}>
      <header><div><h2>{form.id ? 'Edit Psychologist' : 'Add Psychologist'}</h2><p>Configure scheduling details and weekly availability. Outsourced clinician payment rates are managed securely in Finance → Psychologist Payments.</p></div><button type="button" onClick={onClose}>Close</button></header>
      {errorKeys.length > 0 && <div className="doctor-form-summary" role="alert">{errors._form || 'Please fix the highlighted fields below.'}</div>}
      <label>Clinician name<input {...errorProps('doctor_name')} disabled={readOnlyIdentity} value={form.doctor_name} onChange={event => field('doctor_name', event.target.value)} /><DoctorFieldError errors={errors} name="doctor_name" /></label>
      <label>Clinician type<select {...errorProps('clinician_type')} disabled={readOnlyIdentity} value={form.clinician_type || 'outsourced'} onChange={event => field('clinician_type', event.target.value)}><option value="staff_psychologist">Staff psychologist</option><option value="psychology_intern">Psychology intern</option><option value="outsourced">Outsourced</option></select><DoctorFieldError errors={errors} name="clinician_type" /></label>
      <label>Specialization<input {...errorProps('specialization')} disabled={readOnlyIdentity} value={form.specialization} onChange={event => field('specialization', event.target.value)} /><DoctorFieldError errors={errors} name="specialization" /></label>
      <label>Qualification<input {...errorProps('qualification')} disabled={readOnlyIdentity} value={form.qualification} onChange={event => field('qualification', event.target.value)} /><DoctorFieldError errors={errors} name="qualification" /></label>
      <label>Photo path or URL<input {...errorProps('photo_url')} disabled={readOnlyIdentity} value={form.photo_url || ''} onChange={event => field('photo_url', event.target.value)} placeholder="/images/clinicians/name.webp" /><DoctorFieldError errors={errors} name="photo_url" /></label>
      <label>Phone number<input {...errorProps('phone')} disabled={readOnlyIdentity} type="tel" value={form.phone} onChange={event => field('phone', event.target.value)} /><DoctorFieldError errors={errors} name="phone" /></label>
      <label>Email<input {...errorProps('email')} disabled={readOnlyIdentity} type="email" value={form.email || ''} onChange={event => field('email', event.target.value)} /><DoctorFieldError errors={errors} name="email" /></label>
      <label>Consultation duration (minutes)<input {...errorProps('consultation_duration_minutes')} disabled={readOnlyIdentity} type="number" min="5" max="240" value={form.consultation_duration_minutes} onChange={event => field('consultation_duration_minutes', Number(event.target.value))} /><DoctorFieldError errors={errors} name="consultation_duration_minutes" /></label>
      {form.id ? <p className="clinician-lifecycle-note">Active status is managed from the clinician actions menu to protect appointments and payment history.</p> : <label>Status<select {...errorProps('status')} disabled={readOnlyIdentity} value={form.status} onChange={event => field('status', event.target.value)}><option value="active">Active</option><option value="unavailable">Unavailable</option></select><DoctorFieldError errors={errors} name="status" /></label>}
      <label>Short notes<textarea {...errorProps('notes')} disabled={readOnlyIdentity} value={form.notes || ''} onChange={event => field('notes', event.target.value)} /><DoctorFieldError errors={errors} name="notes" /></label>
      <section className={`availability-editor${errors?.availability ? ' availability-error' : ''}`} aria-describedby={errors?.availability ? 'doctor-availability-error' : undefined}>
        <h3>Weekly availability</h3>{errors?.availability && <small className="field-error" id="doctor-availability-error">{errors.availability}</small>}
        {days.map((day, index) => <div key={day}><b>{day}</b><span>{(availability[index] || []).map((range: any, rangeIndex: number) => {
          const invalid = !!range.start_time && !!range.end_time && range.end_time <= range.start_time;
          const updateRange = (name: 'start_time' | 'end_time', value: string) => { onAvailabilityChange(updateAvailability(availability, index, rangeIndex, name, value)); onClearError('availability'); };
          return <span key={`${day}-${rangeIndex}`}><input aria-label={`${day} start time`} type="time" value={range.start_time} onChange={event => updateRange('start_time', event.target.value)} /><input aria-label={`${day} end time`} aria-invalid={invalid || undefined} aria-describedby={invalid ? `doctor-availability-${index}-${rangeIndex}-error` : undefined} className={invalid ? 'input-error' : undefined} min={range.start_time || undefined} type="time" value={range.end_time} onChange={event => updateRange('end_time', event.target.value)} />{invalid && <small className="field-error" id={`doctor-availability-${index}-${rangeIndex}-error`}>End time must be later than start time.</small>}<button type="button" onClick={() => { onAvailabilityChange(removeAvailability(availability, index, rangeIndex)); onClearError('availability'); }}>Remove</button></span>;
        })}</span><button type="button" onClick={() => { onAvailabilityChange(addAvailability(availability, index)); onClearError('availability'); }}>Add range</button></div>)}
      </section>
      <footer><button className="btn border" type="button" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : readOnlyIdentity ? 'Save availability' : 'Save clinician'}</button></footer>
    </form>
  </div>;
}

function Filters({ doctors, patients, doctorFilter, setDoctorFilter, patientFilter, setPatientFilter, statusFilter, setStatusFilter }: any) {
  return <div className="doctor-filters"><select className="input" value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}><option value="">All psychologists</option>{doctors.map((doctor: any) => <option value={doctor.id} key={doctor.id}>{doctor.doctor_name}</option>)}</select><select className="input" value={patientFilter} onChange={e => setPatientFilter(e.target.value)}><option value="">All clients</option>{patients.map((patient: any) => <option value={patient.id} key={patient.id}>{patient.full_name}</option>)}</select><select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{appointmentStatuses.map(status => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></div>;
}

function AppointmentGroups({ appointments, onOpen }: { appointments: any[]; onOpen: (appointment: any) => void }) {
  const today = dateKey(new Date());
  const groups = [
    ['Today', appointments.filter(item => dateKey(new Date(item.start_at)) === today)],
    ['Upcoming', appointments.filter(item => new Date(item.start_at) > new Date() && !['completed', 'cancelled', 'no_show'].includes(item.status))],
    ['Completed', appointments.filter(item => item.status === 'completed')],
    ['Cancelled', appointments.filter(item => item.status === 'cancelled')],
  ] as const;
  return <div className="appointment-groups">{groups.map(([title, rows]) => <section key={title}><h3>{title}</h3>{rows.length ? rows.map(item => <button type="button" onClick={() => onOpen(item)} key={item.id}><span><b>{item.patient?.full_name || 'Client'}</b><small>{fmtDate(item.start_at)} - {fmtTime(item.start_at)} - {item.doctor?.doctor_name || 'Psychologist'}</small></span><EmployeeStatusBadge tone={statusTones[item.status as AppointmentStatus]}>{statusLabels[item.status as AppointmentStatus]}</EmployeeStatusBadge></button>) : <p>No appointments.</p>}</section>)}</div>;
}

function AppointmentPanel({ appointment, canUpdate, canCancel, saving, onClose, onStatus, onReschedule }: { appointment: any; canUpdate: boolean; canCancel: boolean; saving: boolean; onClose: () => void; onStatus: (status: AppointmentStatus) => void; onReschedule: () => void }) {
  return <div className="doctor-panel-backdrop"><aside className="doctor-panel"><header><div><h2>{appointment.patient?.full_name || 'Client'}</h2><p>{appointment.doctor?.doctor_name || 'Psychologist'} - {fmtDate(appointment.start_at)}</p></div><button type="button" onClick={onClose}>Close</button></header><dl><div><dt>Time</dt><dd>{fmtTime(appointment.start_at)} to {fmtTime(appointment.end_at)}</dd></div><div><dt>Consultation</dt><dd>{label(appointment.consultation_type)}</dd></div><div><dt>Status</dt><dd><EmployeeStatusBadge tone={statusTones[appointment.status as AppointmentStatus]}>{statusLabels[appointment.status as AppointmentStatus]}</EmployeeStatusBadge></dd></div><div><dt>Remarks</dt><dd>{appointment.remarks || '-'}</dd></div></dl><div className="panel-actions">{canUpdate && <button disabled={saving} type="button" onClick={() => onStatus('confirmed')}>Confirm</button>}{canUpdate && <button disabled={saving} type="button" onClick={onReschedule}>Reschedule</button>}{canUpdate && <button disabled={saving} type="button" onClick={() => onStatus('completed')}>Completed</button>}{canUpdate && <button disabled={saving} type="button" onClick={() => onStatus('no_show')}>No Show</button>}{canCancel && <button disabled={saving} type="button" className="danger" onClick={() => onStatus('cancelled')}>Cancel</button>}</div></aside></div>;
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
  return { ...current, [day]: [...(current[day] || []), { start_time: '09:00', end_time: '17:00' }] };
}
function updateAvailability(current: Record<number, { start_time: string; end_time: string }[]>, day: number, index: number, field: 'start_time' | 'end_time', value: string) {
  return { ...current, [day]: (current[day] || []).map((range, rangeIndex) => rangeIndex === index ? { ...range, [field]: value } : range) };
}
function removeAvailability(current: Record<number, { start_time: string; end_time: string }[]>, day: number, index: number) {
  return { ...current, [day]: (current[day] || []).filter((_, rangeIndex) => rangeIndex !== index) };
}

function availabilitySummary(ranges: { day_of_week: number; start_time: string; end_time: string }[]) {
  if (!ranges.length) return 'No weekly availability configured.';
  return ranges.map(range => `${shortDays[range.day_of_week]} ${range.start_time.slice(0, 5)}-${range.end_time.slice(0, 5)}`).join(' | ');
}
