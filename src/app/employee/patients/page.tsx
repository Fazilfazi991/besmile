import { PatientList } from '@/components/patient-list';

export default function EmployeePatientsPage() {
  return <PatientList basePath="/employee/patients" canCreate={false} title="Patients" description="Patient records available through your role and assignments." />;
}
