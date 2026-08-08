export const employeeStatuses = ['active', 'inactive', 'on_leave', 'intern', 'probation', 'resigned', 'terminated'] as const;
export type EmployeeStatus = typeof employeeStatuses[number];
export const operationalEmployeeStatuses = ['active', 'intern', 'probation'] as const;

const labels: Record<EmployeeStatus, string> = {
  active: 'Active', inactive: 'Inactive', on_leave: 'On leave', intern: 'Intern',
  probation: 'Probation', resigned: 'Resigned', terminated: 'Terminated',
};

export const employeeStatusLabel = (status: string | null | undefined) =>
  labels[status as EmployeeStatus] || String(status || 'Unknown').replaceAll('_', ' ');

// Employment lifecycle is deliberately separate from roles and permission grants.
export const isOperationalEmployeeStatus = (status: string | null | undefined) =>
  operationalEmployeeStatuses.includes(String(status) as typeof operationalEmployeeStatuses[number]);

export const isFormerEmployeeStatus = (status: string | null | undefined) =>
  ['inactive', 'resigned', 'terminated'].includes(String(status));

// Payroll policy is confirmed only for active employees. Intern/probation eligibility
// remains an explicit client decision and must not be inferred from their access.
export const isPayrollEligibleEmployeeStatus = (status: string | null | undefined) => status === 'active';
