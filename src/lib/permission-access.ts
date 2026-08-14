export type PermissionRequirement = { anyOf?: readonly string[]; allOf?: readonly string[]; noneOf?: readonly string[] };
export type NavigationLink = { label: string; href: string; requirement?: PermissionRequirement; activeHrefs?: readonly string[]; exact?: boolean };
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
const requireAllAndAny = (all: readonly string[], any: readonly string[]): PermissionRequirement => ({ allOf: all, anyOf: any });
const requireAnyWithout = (any: readonly string[], none: readonly string[]): PermissionRequirement => ({ anyOf: any, noneOf: none });

export function permissionAllows(granted: ReadonlySet<string>, requirement?: PermissionRequirement) {
  if (!requirement) return true;
  const allAllowed = !requirement.allOf || requirement.allOf.every((permission) => granted.has(permission));
  const anyAllowed = !requirement.anyOf || requirement.anyOf.some((permission) => granted.has(permission));
  const noneBlocked = !requirement.noneOf || requirement.noneOf.every((permission) => !granted.has(permission));
  return allAllowed && anyAllowed && noneBlocked;
}

export function filterNavigation(groups: readonly NavigationGroup[], granted: ReadonlySet<string>) {
  return groups.map((group) => ({ ...group, links: group.links.filter((link) => permissionAllows(granted, link.requirement)) })).filter((group) => group.links.length > 0);
}

export function navigationForProfile(role: string | null | undefined) {
  return normalizeRole(role) === 'super_admin' || isManagementRole(role) ? adminNavigation : employeeNavigation;
}

export function adminRouteRequirement(path: string): PermissionRequirement {
  if (path === '/admin') return anyOf('admin.access', 'dashboard.view');
  if (path === '/admin/profile') return anyOf('admin.access', 'dashboard.view');
  if (path === '/admin/my-attendance') return anyOf('attendance.self');
  if (path === '/admin/attendance') return anyOf('attendance.view', 'attendance.manage');
  if (path.startsWith('/admin/calendar')) return anyOf('meetings.view', 'meetings.create', 'meetings.manage');
  if (path.startsWith('/admin/meetings')) return anyOf('meetings.view', 'meetings.create', 'meetings.manage');
  if (path === '/admin/employees/new') return anyOf('employees.create');
  if (path.startsWith('/admin/leaves')) return anyOf('leave.approve', 'leave.manage', 'leave.review');
  if (path === '/admin/tasks') return anyOf('tasks.manage', 'tasks.assign');
  if (path === '/admin/task-access') return anyOf('tasks.manage_access');
  if (path.startsWith('/admin/ideas/categories')) return anyOf('ideas.manage_categories');
  if (path.startsWith('/admin/ideas')) return anyOf('ideas.view', 'ideas.view_reports', 'ideas.manage_status');
  if (path.startsWith('/admin/customer-feedback')) return anyOf('customer_feedback.view');
  if (path.startsWith('/admin/doctor-scheduling')) return anyOf('doctor_scheduling.view');
  if (path.startsWith('/admin/documents')) return anyOf('documents.manage', 'documents.employee.manage');
  if (path.startsWith('/admin/announcements')) return anyOf('announcements.manage');
  if (path.startsWith('/admin/notifications')) return anyOf('notifications.view');
  if (path === '/admin/finance/invoices/new') return anyOf('invoices.manage');
  if (path.startsWith('/admin/finance/invoices')) return anyOf('invoices.view', 'invoices.manage');
  if (path === '/admin/finance/payroll/settings') return anyOf('payroll.manage');
  if (path.startsWith('/admin/finance/psychologist-payments')) return anyOf('psychologist_payments.view');
  if (path.startsWith('/admin/finance/payroll')) return anyOf('payroll.view', 'payroll.manage');
  if (path.startsWith('/admin/finance/reports')) return anyOf('reports.finance.view', 'reports.view');
  if (path.startsWith('/admin/reports')) return anyOf('reports.finance.view', 'reports.view');
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
  if (path.startsWith('/employee/calendar')) return undefined;
  if (path.startsWith('/employee/meetings')) return anyOf('meetings.view', 'meetings.create', 'meetings.manage');
  if (path.startsWith('/employee/leaves')) return anyOf('leave.self', 'leave.request', 'leave.view', 'leave.manage', 'leave.approve');
  if (path.startsWith('/employee/tasks/access')) return anyOf('tasks.manage_access');
  if (path.startsWith('/employee/tasks/manage')) return anyOf('tasks.assign');
  if (path.startsWith('/employee/tasks')) return anyOf('tasks.view_self', 'tasks.assign');
  if (path.startsWith('/employee/ideas')) return anyOf('ideas.view');
  if (path.startsWith('/employee/doctor-scheduling')) return anyOf('doctor_scheduling.view');
  if (path.startsWith('/employee/documents')) return anyOf('documents.view', 'documents.employee.view', 'patient_documents.view');
  if (path.startsWith('/employee/assigned-patients')) return anyOf('patients.view_assigned');
  if (path === '/employee/patients') return anyOf('patients.view');
  if (path.startsWith('/employee/patients')) return anyOf('patients.view', 'patients.view_assigned');
  if (path.startsWith('/employee/crm/sales')) return anyOf('crm.view_team', 'crm.manage_all', 'sales.view');
  if (path.startsWith('/employee/crm')) return anyOf('crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view');
  if (path.startsWith('/employee/dashboard')) return anyOf('dashboard.view');
  return undefined;
}

export const adminNavigation: readonly NavigationGroup[] = [
  { title: 'OVERVIEW', links: [{ label: 'Dashboard', href: '/admin', requirement: anyOf('admin.access', 'dashboard.view') }, { label: 'Reports', href: '/admin/reports', requirement: anyOf('reports.finance.view', 'reports.view') }] },
  { title: 'OPERATIONS', links: [{ label: 'Employees', href: '/admin/employees', requirement: anyOf('employees.view') }, { label: 'Clients', href: '/admin/patients', requirement: anyOf('patients.view', 'patients.view_assigned', 'patients.view_all') }, { label: 'Official Documents', href: '/admin/documents/generate', requirement: anyOf('documents.manage', 'documents.employee.manage') }, { label: 'Operational Documents', href: '/admin/documents', exact: true, requirement: anyOf('documents.manage', 'documents.employee.manage', 'documents.administration.manage') }] },
  { title: 'WORK MANAGEMENT', links: [{ label: 'My Attendance', href: '/admin/my-attendance', requirement: anyOf('attendance.self') }, { label: 'Staff Attendance', href: '/admin/attendance', requirement: anyOf('attendance.view', 'attendance.manage') }, { label: 'My Calendar', href: '/admin/calendar', requirement: anyOf('meetings.view', 'meetings.create', 'meetings.manage') }, { label: 'Meetings', href: '/admin/meetings', requirement: anyOf('meetings.view', 'meetings.create', 'meetings.manage') }, { label: 'Leave approvals', href: '/admin/leaves', requirement: anyOf('leave.approve', 'leave.manage', 'leave.review') }, { label: 'Tasks', href: '/admin/tasks', requirement: anyOf('tasks.manage', 'tasks.assign') }, { label: 'Task Access', href: '/admin/task-access', requirement: anyOf('tasks.manage_access') }, { label: 'Appointment & Scheduling', href: '/admin/doctor-scheduling', requirement: anyOf('doctor_scheduling.view') }, { label: 'Innovation Hub', href: '/admin/ideas', requirement: anyOf('ideas.view', 'ideas.manage_status', 'ideas.view_reports') }, { label: 'Customer Feedback', href: '/admin/customer-feedback', requirement: anyOf('customer_feedback.view') }, { label: 'Innovation Categories', href: '/admin/ideas/categories', requirement: anyOf('ideas.manage_categories') }] },
  { title: 'COMMUNICATION', links: [{ label: 'Chat', href: '/admin/chat', requirement: anyOf('chat.use') }, { label: 'Announcements', href: '/admin/announcements', requirement: anyOf('announcements.manage') }, { label: 'Notifications', href: '/admin/notifications', requirement: anyOf('notifications.view') }, { label: 'Profile', href: '/admin/profile', requirement: anyOf('admin.access', 'dashboard.view') }] },
  { title: 'CRM', links: [{ label: 'CRM Dashboard', href: '/admin/crm', requirement: anyOf('crm.manage_all', 'crm.view_team', 'leads.view') }, { label: 'Leads Management', href: '/admin/crm/leads', requirement: anyOf('crm.manage_all', 'crm.view_team', 'leads.view') }, { label: 'Follow-ups', href: '/admin/crm/follow-ups', requirement: anyOf('crm.manage_all', 'crm.view_team', 'leads.view') }, { label: 'Import Leads', href: '/admin/crm/import', requirement: anyOf('crm.import') }, { label: 'Sales', href: '/admin/crm/sales', requirement: anyOf('crm.manage_all', 'crm.view_team', 'sales.view') }] },
  { title: 'FINANCE', links: [{ label: 'Finance Dashboard', href: '/admin/finance', requirement: anyOf('finance.dashboard.view', 'finance.view') }, { label: 'Income', href: '/admin/finance/income', requirement: anyOf('income.view', 'income.manage') }, { label: 'Expenses', href: '/admin/finance/expenses', requirement: anyOf('expenses.view', 'expenses.manage') }, { label: 'Invoices', href: '/admin/finance/invoices', requirement: anyOf('invoices.view', 'invoices.manage') }, { label: 'Payroll', href: '/admin/finance/payroll', requirement: anyOf('payroll.view', 'payroll.manage') }, { label: 'Psychologist Payments', href: '/admin/finance/psychologist-payments', requirement: anyOf('psychologist_payments.view') }, { label: 'Reports', href: '/admin/finance/reports', requirement: anyOf('reports.finance.view', 'reports.view') }] },
  { title: 'ADMINISTRATION', links: [{ label: 'Roles & Access', href: '/admin/access', requirement: anyOf('roles.manage', 'permissions.manage') }] },
];

export const employeeNavigation: readonly NavigationGroup[] = [
  { title: 'WORKSPACE', links: [{ label: 'Dashboard', href: '/employee/dashboard', requirement: anyOf('dashboard.view') }, { label: 'Attendance', href: '/employee/attendance', requirement: anyOf('attendance.self', 'attendance.view_self', 'attendance.view', 'attendance.manage') }, { label: 'My Calendar', href: '/employee/calendar' }, { label: 'Meetings', href: '/employee/meetings', requirement: anyOf('meetings.view', 'meetings.create', 'meetings.manage') }, { label: 'Leave', href: '/employee/leaves', requirement: anyOf('leave.self', 'leave.request', 'leave.view', 'leave.manage', 'leave.approve') }, { label: 'Tasks', href: '/employee/tasks', requirement: anyOf('tasks.view_self', 'tasks.assign') }, { label: 'Manage Tasks', href: '/employee/tasks/manage', requirement: anyOf('tasks.assign') }, { label: 'Appointment & Scheduling', href: '/employee/doctor-scheduling', activeHrefs: ['/admin/doctor-scheduling'], requirement: anyOf('doctor_scheduling.view') }, { label: 'Innovation Hub', href: '/employee/ideas', activeHrefs: ['/admin/ideas'], requirement: anyOf('ideas.view') }, { label: 'Clients', href: '/employee/patients', activeHrefs: ['/admin/patients'], requirement: anyOf('patients.view') }, { label: 'Assigned Clients', href: '/employee/assigned-patients', activeHrefs: ['/employee/patients'], requirement: anyOf('patients.view_assigned') }, { label: 'Documents', href: '/employee/documents', requirement: anyOf('documents.view', 'documents.employee.view', 'patient_documents.view') }] },
  { title: 'OPERATIONS', links: [{ label: 'Employees', href: '/admin/employees', requirement: requireAllAndAny(['admin.shell'], ['employees.view']) }, { label: 'Clients', href: '/admin/patients', requirement: requireAllAndAny(['admin.shell'], ['patients.view', 'patients.view_all']) }, { label: 'Operational Documents', href: '/admin/documents', requirement: requireAllAndAny(['admin.shell'], ['documents.employee.manage', 'documents.administration.manage']) }] },
  { title: 'COMMUNICATION', links: [{ label: 'Notifications', href: '/employee/notifications' }, { label: 'Chat', href: '/employee/chat', requirement: anyOf('chat.use') }, { label: 'Profile', href: '/employee/profile' }] },
  { title: 'CRM', links: [{ label: 'CRM Dashboard', href: '/admin/crm', requirement: requireAllAndAny(['admin.shell'], ['crm.manage_all', 'crm.view_team', 'leads.view', 'sales.view']) }, { label: 'Leads', href: '/admin/crm/leads', requirement: requireAllAndAny(['admin.shell'], ['crm.manage_all', 'crm.view_team', 'leads.view']) }, { label: 'Follow-ups', href: '/admin/crm/follow-ups', requirement: requireAllAndAny(['admin.shell'], ['crm.manage_all', 'crm.view_team', 'leads.view']) }, { label: 'Clients', href: '/admin/crm/sales', requirement: requireAllAndAny(['admin.shell'], ['crm.manage_all', 'crm.view_team', 'sales.view']) }, { label: 'CRM Dashboard', href: '/employee/crm', requirement: requireAnyWithout(['crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view', 'sales.view'], ['admin.shell']) }, { label: 'My Leads', href: '/employee/crm/leads', requirement: requireAnyWithout(['crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view'], ['admin.shell']) }, { label: 'My Follow-ups', href: '/employee/crm/follow-ups', requirement: requireAnyWithout(['crm.view_assigned', 'crm.view_team', 'crm.manage_all', 'leads.view'], ['admin.shell']) }, { label: 'My Sales', href: '/employee/crm/sales', requirement: requireAnyWithout(['crm.view_team', 'crm.manage_all', 'sales.view'], ['admin.shell']) }] },
];

export const navigationPermissionCodes = [...new Set([...adminNavigation, ...employeeNavigation].flatMap((group) => group.links.flatMap((link) => [...(link.requirement?.anyOf || []), ...(link.requirement?.allOf || []), ...(link.requirement?.noneOf || [])])))];
