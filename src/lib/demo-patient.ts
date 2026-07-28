export const DEMO_PATIENT_NUMBER = 'DEMO-PAT-001';
export const DEMO_PATIENT_TAGS = ['Demo Patient', 'Online Session'];
export function demoSeedAction(existingPatientId?: string | null) { return existingPatientId ? 'already_exists' : 'create'; }
export function isDemoPatient(patient: { is_demo?: boolean | null }) { return patient.is_demo === true; }
export function patientMatchesSearch(patient: { full_name?: string | null; patient_number?: string | null; phone?: string | null; email?: string | null }, term: string) {
  const needle = term.trim().toLowerCase();
  return !needle || [patient.full_name, patient.patient_number, patient.phone, patient.email].some(value => value?.toLowerCase().includes(needle));
}
