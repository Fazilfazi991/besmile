import { PatientWorkspace } from '@/components/patient-workspace';
import { isDemoMode } from '@/lib/demo-mode';
import { demoPatients } from '@/demo/demo-data';
import { DemoPatientDetail } from '@/demo/demo-workspace';

export default async function AssignedPatientPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (isDemoMode()) return <DemoPatientDetail patient={demoPatients.find((item) => item.slug === slug) || demoPatients[0]} />;
  return <PatientWorkspace patientSlug={slug} basePath="/employee/patients" />;
}
