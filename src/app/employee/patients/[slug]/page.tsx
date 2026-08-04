import { PatientWorkspace } from '@/components/patient-workspace';

export default async function AssignedPatientPage({ params }: { params: Promise<{ slug: string }> }) {
  return <PatientWorkspace patientSlug={(await params).slug} basePath="/employee/patients" />;
}
