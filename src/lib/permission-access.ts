export type PermissionRequirement = { anyOf: readonly string[] };
export type NavigationLink = { label: string; href: string; requirement?: PermissionRequirement };
export type NavigationGroup = { title: string; links: readonly NavigationLink[] };

/** Roles that use the management shell, regardless of their display designation. */
const managementRoleCodes = new Set(['chairman', 'director', 'general_manager']);

export function normalizeRole(role?: string | null) {
  return (role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isManagementRole(role?: string | null) {
  return managementRoleCodes.has(normalizeRole(role));
}

export function isSecurityAdministratorRole(role?: string | null) {
  return normalizeRole(role) === 'super_admin';
}

export function workspaceLandingPath(role?: string | null) {
  return normalizeRole(role) === 'super_admin' || isManagementRole(role) ? '/admin' : '/employee/dashboard';
}

export function dashboardTitle(role?: string | null) {
  const labels: Record<string, string> = {
    super_admin: 'Super Admin Dashboard',
    chairman: 'Chairman Dashboard',
    director: 'Director Dashboard',
    general_manager: 'General Manager Dashboard',
  };
  return labels[normalizeRole(role)] || 'Management Dashboard';
}

export function workspaceTitle(role?: string | null) {
  const title = dashboardTitle(role).replace(' Dashboard', '');
  return `${title} Workspace`;
}

const anyOf = (...permissions: string[]): PermissionRequirement => ({ anyOf: permissions });

export function permissionAllows(granted: ReadonlySet<string>, requirement?: PermissionRequirement) {
  return !requirement || requirement.anyOf.some((permission) => granted.has(permission));
}

export function filterNavigation(groups: readonly NavigationGroup[], granted: ReadonlySet<string>) {
  return groups.map((group) => ({ ...group, links: group.links.filter((link) => permissionAllows(granted, link.requirement)) })).filter((group) => group.links.length > 0);
}

export function adminRouteRequirement(path: string): PermissionRequirement {
  if (path === '/admin') return anyOf('admin.access', 'dashboard.view');
  if (path === '/admin/tasks') return anyOf('tasks.assign');
  if (path === '/admin/task-access') return anyOf('tasks.manage_access');
  if (path.startsWith('/admin/documents')) return anyOf('documents.manage', 'documents.employee.manage');
  if (path.startsWith('/admin/announcements')) return anyOf('announcements.manage');
  if (path.startsWith('/admin/notifications')) return anyOf('notifications.view');
  if (path === '/admin/finance/invoices/new') return anyOf('invoices.manage');
  if (path.startsWith('/admin/finance/invoices')) return anyOf('invoices.view', 'invoices.manage');
  if (path === '/admin/finance/payroll/settings') return anyOf('payroll.manage');
  if (path.startsWith('/admin/finance/payroll')) return anyOf('payroll.view', 'payroll.manage');
  if (path.startsWith('/admin/finance/reports')) return anyOf('reports.finance.view', 'reports.view');
  if (path.startsWith('/admin/finance/income')) return anyOf('income.view', 'income.manage');
  if (path.startsWith('/admin/finance/expenses')) return anyOf('expenses.view', 'expenses.manage');
  if (path.startsWith('/admin/finance')) return anyOf('finance.dashboard.view', 'finance.view');
  if (path.startsWith('/admin/access')) return anyOf('roles.manage', 'permissions.manage');
  if (path.startsWith('/admin/patients')) return anyOf('patients.view', 'patients.view_assigned');
  if (path.startsWith('/admin/crm/import')) return anyOf('crm.import');
  if (path.startsWith('/admin/crm')) return anyOf('crm.manage_all', 'crm.view_team', 'leads.view', 'sales.view');
  if (path.startsWith('/admin/employees')) return anyOf('employees.view');
  return anyOf('admin.access');
}

export function employeeRouteRequirement(path: string): PermissionRequirement | undefined {
  if (path.startsWith('/employee/profile') || path.startsWith('/employee/notifications')) return undefined;
  if (path.startsWith('/employee/announcements')) return anyOf('announcements.view', 'announcements.manage');
  if (path.startsWith('/employee/chat')) return anyOf('chat.use');
  if (path.startsWith('/employee/attendance')) return anyOf('attendance.self', 'attendance.view_self', 'attendance.view', 'attendance.manage');
  if (path.startsWith('/employee/leaves')) return anyOf('leave.self', 'leave.request', 'leave.view', 'leave.manage', 'leave.approve');
  if (path.startsWith('/employee/tasks/access')) return anyOf('tasks.manage_access');
  if (path.startsWith('/employee/tasks/manage')) return anyOf('tasks.assign');
  if (path.startsWith('/employee/tasks')) return anyOf('tasks.view_self', 'tasks.assign');
  if (path.startsWith('/employee/documents')) return anyOf('documents.view', 'documents.employee.view', 'patient_documents.view');
  if (path.startsWith('/employee/patients')) return anyOf('patients.view', 'patients.view_assigned');
  if (path.startsWith('/employee/crm/sales')) return anyOf('crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'sales.view');
  if (path.startsWith('/employee/crm')) return anyOf('crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view');
  if (path.startsWith('/employee/dashboard')) return anyOf('dashboard.view');
  return undefined;
}

export const adminNavigation: readonly NavigationGroup[] = [
  { title: 'OVERVIEW', links: [{ label: 'Dashboard', href: '/admin', requirement: anyOf('admin.access', 'dashboard.view') }] },
  { title: 'PEOPLE', links: [{ label: 'Employees', href: '/admin/employees', requirement: anyOf('employees.view') }, { label: 'Patients', href: '/admin/patients', requirement: anyOf('patients.view', 'patients.view_assigned') }] },
  { title: 'WORK MANAGEMENT', links: [{ label: 'Tasks', href: '/admin/tasks', requirement: anyOf('tasks.assign') }, { label: 'Task Access', href: '/admin/task-access', requirement: anyOf('tasks.manage_access') }, { label: 'Documents', href: '/admin/documents', requirement: anyOf('documents.manage', 'documents.employee.manage') }] },
  { title: 'COMMUNICATION', links: [{ label: 'Chat', href: '/admin/chat', requirement: anyOf('chat.use') }, { label: 'Announcements', href: '/admin/announcements', requirement: anyOf('announcements.manage') }, { label: 'Notifications', href: '/admin/notifications', requirement: anyOf('notifications.view') }] },
  { title: 'CRM', links: [{ label: 'Leads Management', href: '/admin/crm', requirement: anyOf('crm.manage_all', 'crm.view_team', 'leads.view') }, { label: 'Import Leads', href: '/admin/crm/import', requirement: anyOf('crm.import') }, { label: 'Sales', href: '/admin/crm/sales', requirement: anyOf('crm.manage_all', 'crm.view_team', 'sales.view') }] },
  { title: 'FINANCE', links: [{ label: 'Finance Dashboard', href: '/admin/finance', requirement: anyOf('finance.dashboard.view', 'finance.view') }, { label: 'Income', href: '/admin/finance/income', requirement: anyOf('income.view', 'income.manage') }, { label: 'Expenses', href: '/admin/finance/expenses', requirement: anyOf('expenses.view', 'expenses.manage') }, { label: 'Invoices', href: '/admin/finance/invoices', requirement: anyOf('invoices.view', 'invoices.manage') }, { label: 'Payroll', href: '/admin/finance/payroll', requirement: anyOf('payroll.view', 'payroll.manage') }, { label: 'Reports', href: '/admin/finance/reports', requirement: anyOf('reports.finance.view', 'reports.view') }] },
  { title: 'ADMINISTRATION', links: [{ label: 'Roles & Access', href: '/admin/access', requirement: anyOf('roles.manage', 'permissions.manage') }] },
];

export const employeeNavigation: readonly NavigationGroup[] = [
  { title: 'WORKSPACE', links: [{ label: 'Dashboard', href: '/employee/dashboard', requirement: anyOf('dashboard.view') }, { label: 'Attendance', href: '/employee/attendance', requirement: anyOf('attendance.self', 'attendance.view_self', 'attendance.view', 'attendance.manage') }, { label: 'Leave', href: '/employee/leaves', requirement: anyOf('leave.self', 'leave.request', 'leave.view', 'leave.manage', 'leave.approve') }, { label: 'Tasks', href: '/employee/tasks', requirement: anyOf('tasks.view_self', 'tasks.assign') }, { label: 'Manage Tasks', href: '/employee/tasks/manage', requirement: anyOf('tasks.assign') }, { label: 'Task Assignment Access', href: '/employee/tasks/access', requirement: anyOf('tasks.manage_access') }, { label: 'Documents', href: '/employee/documents', requirement: anyOf('documents.view', 'documents.employee.view', 'patient_documents.view') }, { label: 'Assigned Patients', href: '/employee/patients', requirement: anyOf('patients.view', 'patients.view_assigned') }] },
  { title: 'COMMUNICATION', links: [{ label: 'Announcements', href: '/employee/announcements', requirement: anyOf('announcements.view', 'announcements.manage') }, { label: 'Notifications', href: '/employee/notifications' }, { label: 'Chat', href: '/employee/chat', requirement: anyOf('chat.use') }, { label: 'Profile', href: '/employee/profile' }] },
  { title: 'CRM', links: [{ label: 'CRM Dashboard', href: '/employee/crm', requirement: anyOf('crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view', 'sales.view') }, { label: 'My Leads', href: '/employee/crm/leads', requirement: anyOf('crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view') }, { label: 'My Follow-ups', href: '/employee/crm/follow-ups', requirement: anyOf('crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view') }, { label: 'My Sales', href: '/employee/crm/sales', requirement: anyOf('crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'sales.view') }] },
];

export const navigationPermissionCodes = [...new Set([...adminNavigation, ...employeeNavigation].flatMap((group) => group.links.flatMap((link) => link.requirement?.anyOf || [])))];
