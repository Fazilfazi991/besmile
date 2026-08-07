import { DoctorSchedulingPage } from '@/components/doctor-scheduling';

export default async function ClinicianSchedulePage({ searchParams }: { searchParams: Promise<{ appointment?: string }> }) {
  const params = await searchParams;
  return <DoctorSchedulingPage initialAppointmentId={params.appointment} workspace="clinician" />;
}
