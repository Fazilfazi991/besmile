import { PatientWorkspace } from '@/components/patient-workspace';

export default async function AssignedPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  return <PatientWorkspace patientId={(await params).patientId} />;
}
