import { DoctorSchedulingPage } from '@/components/doctor-scheduling';

export default async function EmployeeDoctorSchedulingPage({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  const params = await searchParams;
  return <DoctorSchedulingPage initialPatientId={params.patient} />;
}
