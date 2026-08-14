export const adminDashboardPermissionCodes = [
  'attendance.self', 'attendance.view', 'attendance.view_team', 'attendance.manage', 'employees.view',
  'leave.approve', 'leave.manage', 'leave.review',
  'tasks.manage', 'tasks.assign',
  'crm.manage_all', 'crm.view_team', 'leads.view', 'sales.view',
  'documents.manage', 'documents.employee.manage', 'notifications.view',
  'finance.dashboard.view', 'finance.view', 'payroll.view', 'payroll.manage', 'invoices.view', 'invoices.manage', 'reports.view', 'reports.finance.view',
  'audit.view',
] as const;

export type AdminDashboardRequestKey = 'workforce' | 'leave' | 'task' | 'crm' | 'documentApproval' | 'notification' | 'finance' | 'scheduling' | 'audit';
export type AdminDashboardRequests = Record<AdminDashboardRequestKey, () => Promise<unknown>>;
export type AdminDashboardRequestResults = Partial<Record<AdminDashboardRequestKey, PromiseSettledResult<unknown>>>;

export function adminDashboardCapabilities(effectivePermissions: ReadonlySet<string>) {
  const hasAny = (...codes: string[]) => codes.some(code => effectivePermissions.has(code));
  return {
    workforce: hasAny('attendance.view', 'attendance.manage'),
    leave: hasAny('leave.approve', 'leave.manage', 'leave.review'),
    task: hasAny('tasks.manage', 'tasks.assign'),
    crm: hasAny('crm.manage_all', 'crm.view_team', 'leads.view', 'sales.view'),
    documentApproval: hasAny('documents.manage', 'documents.employee.manage'),
    notification: hasAny('notifications.view'),
    finance: hasAny('finance.dashboard.view', 'finance.view'),
    scheduling: hasAny('doctor_scheduling.view'),
    audit: hasAny('audit.view'),
  };
}

export async function runAdminDashboardRequestPlan(effectivePermissions: ReadonlySet<string>, requests: AdminDashboardRequests) {
  const capabilities = adminDashboardCapabilities(effectivePermissions);
  const plan: { key: AdminDashboardRequestKey; allowed: boolean; run: () => Promise<unknown> }[] = [
    { key: 'workforce', allowed: capabilities.workforce, run: requests.workforce },
    { key: 'leave', allowed: capabilities.leave, run: requests.leave },
    { key: 'task', allowed: capabilities.task, run: requests.task },
    { key: 'crm', allowed: capabilities.crm, run: requests.crm },
    { key: 'documentApproval', allowed: capabilities.documentApproval, run: requests.documentApproval },
    { key: 'notification', allowed: capabilities.notification, run: requests.notification },
    { key: 'finance', allowed: capabilities.finance, run: requests.finance },
    { key: 'scheduling', allowed: capabilities.scheduling, run: requests.scheduling },
    { key: 'audit', allowed: capabilities.audit, run: requests.audit },
  ];
  const authorized = plan.filter(item => item.allowed);
  const settled = await Promise.allSettled(authorized.map(item => item.run()));
  const results = Object.fromEntries(authorized.map((item, index) => [item.key, settled[index]])) as AdminDashboardRequestResults;
  return { capabilities, results, rejected: settled.some(result => result.status === 'rejected') };
}
