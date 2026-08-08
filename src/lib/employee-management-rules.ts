import { normalizeRole } from './permission-access';
import { employeeStatuses, type EmployeeStatus } from './employee-status';

export { employeeStatuses, type EmployeeStatus } from './employee-status';

const protectedRoles = new Set(['chairman', 'director', 'super_admin']);

export function isProtectedEmployeeRole(role?: string | null) {
  return protectedRoles.has(normalizeRole(role));
}

export function canManageEmployee(viewer: { role?: string | null; id?: string } | undefined, employee: { role?: string | null; id?: string } | undefined) {
  if (!viewer || !employee || isProtectedEmployeeRole(employee.role)) return false;
  return ['super_admin', 'chairman', 'director', 'general_manager'].includes(normalizeRole(viewer.role));
}

export function canChangeEmployeeStatus(viewer: { role?: string | null; id?: string } | undefined, employee: { role?: string | null; id?: string } | undefined) {
  return canManageEmployee(viewer, employee) && viewer?.id !== employee?.id;
}

export function statusChangeValidation(status: string, reason: string) {
  if (!employeeStatuses.includes(status as EmployeeStatus)) return 'Choose a valid employee status.';
  if (['inactive', 'resigned', 'terminated'].includes(status) && reason.trim().length < 3) return 'Provide a reason for this status change.';
  if (reason.trim().length > 1000) return 'Status reason must be 1,000 characters or fewer.';
  return '';
}
