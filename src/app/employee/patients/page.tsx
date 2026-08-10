import { PatientList } from '@/components/patient-list';

export default function EmployeePatientsPage() {
  return <PatientList basePath="/employee/patients" canCreate={false} title="Clients" description="Client records available through your role and assignments." />;
}
