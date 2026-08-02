import { PatientList } from '@/components/patient-list';

export default function AssignedPatientsPage() {
  return <PatientList basePath="/employee/patients" canCreate={false} title="Assigned Patients" description="Only patient records explicitly available to you are shown." />;
}
