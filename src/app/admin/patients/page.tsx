import { isDemoMode } from '@/lib/demo-mode';
import { DemoPatientList } from '@/demo/demo-workspace';
import { PatientList } from '@/components/patient-list';

export default function AdminPatientsPage() {
  return isDemoMode() ? <DemoPatientList basePath="/admin/patients" /> : <PatientList />;
}
