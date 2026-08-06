import { PatientList } from '@/components/patient-list';

export default function EmployeeAssignedPatientsPage() {
  return <PatientList basePath="/employee/patients" canCreate={false} assignedOnly title="Assigned Patients" description="Patients directly assigned to you or shared with your care team." />;
}
