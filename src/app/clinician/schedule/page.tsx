import { DoctorSchedulingPage } from '@/components/doctor-scheduling';
import { isDemoMode } from '@/lib/demo-mode';
import { DemoSchedule } from '@/demo/demo-workspace';

export default async function ClinicianSchedulePage({ searchParams }: { searchParams: Promise<{ appointment?: string }> }) {
  if (isDemoMode()) return <DemoSchedule />;
  const params = await searchParams;
  return <DoctorSchedulingPage initialAppointmentId={params.appointment} workspace="clinician" />;
}
