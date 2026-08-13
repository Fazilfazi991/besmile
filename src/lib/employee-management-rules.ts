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

export function canRemoveEmployee(
  viewer: { role?: string | null; id?: string } | undefined,
  employee: { role?: string | null; id?: string; status?: string | null; removed_at?: string | null } | undefined,
) {
  if (!canChangeEmployeeStatus(viewer, employee)) return false;
  return ['active', 'intern', 'probation', 'on_leave'].includes(String(employee?.status));
}

export function canRestoreEmployee(
  viewer: { role?: string | null; id?: string } | undefined,
  employee: { role?: string | null; id?: string; status?: string | null; removed_at?: string | null } | undefined,
) {
  return canChangeEmployeeStatus(viewer, employee)
    && employee?.status === 'inactive'
    && Boolean(employee.removed_at);
}

export const employeeRemovalReasons = ['Resigned', 'Terminated', 'Duplicate account', 'Created by mistake', 'Other'] as const;

export function removalReasonValidation(reason: string, details = '') {
  if (!employeeRemovalReasons.includes(reason as typeof employeeRemovalReasons[number])) return 'Choose a reason for removal.';
  const combined = [reason, details.trim()].filter(Boolean).join(': ');
  if (reason === 'Other' && details.trim().length < 3) return 'Provide the removal reason.';
  if (combined.length > 1000) return 'Removal reason must be 1,000 characters or fewer.';
  return '';
}

export function removalReasonText(reason: string, details = '') {
  return [reason, details.trim()].filter(Boolean).join(': ');
}

export function statusChangeValidation(status: string, reason: string) {
  if (!employeeStatuses.includes(status as EmployeeStatus)) return 'Choose a valid employee status.';
  if (['inactive', 'resigned', 'terminated'].includes(status) && reason.trim().length < 3) return 'Provide a reason for this status change.';
  if (reason.trim().length > 1000) return 'Status reason must be 1,000 characters or fewer.';
  return '';
}
