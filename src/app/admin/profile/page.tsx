import EmployeeProfile from '../../employee/profile/page';
import { DemoProfile } from '@/demo/demo-profile';
import { isDemoMode } from '@/lib/demo-mode';

export default function AdminProfile() {
  return isDemoMode() ? <DemoProfile /> : <EmployeeProfile />;
}
