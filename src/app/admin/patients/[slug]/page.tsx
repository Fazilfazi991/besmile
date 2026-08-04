import { PatientWorkspace } from '@/components/patient-workspace';

export default async function PatientPage({ params }: { params: Promise<{ slug: string }> }) {
  return <PatientWorkspace patientSlug={(await params).slug} basePath="/admin/patients" />;
}
