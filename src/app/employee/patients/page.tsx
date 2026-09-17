import { PatientList } from '@/components/patient-list';
import { isDemoMode } from '@/lib/demo-mode';
import { DemoPatientList } from '@/demo/demo-workspace';

export default function EmployeePatientsPage() {
  if (isDemoMode()) return <DemoPatientList />;
  return <PatientList basePath="/employee/patients" canCreate={false} title="Clients" description="Client records available through your role and assignments." />;
}
