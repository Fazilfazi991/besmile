export const permissionCatalogue = [
  'admin.access','admin.shell','employees.view','employees.manage','employees.create','employees.edit','employees.status.manage','attendance.view_self','attendance.view_team','attendance.manage',
  'leave.request','leave.review','tasks.view_self','tasks.view','tasks.create','tasks.manage','tasks.edit','tasks.complete','tasks.reassign','tasks.assign','tasks.manage_access','documents.view','documents.manage',
  'announcements.view','announcements.manage','notifications.view','chat.use','crm.view_assigned','crm.view_team',
  'crm.manage_all','crm.import','finance.view','finance.manage','payroll.view','payroll.manage','invoices.view',
  'invoices.manage','reports.view','roles.manage','permissions.manage','audit.view','settings.manage',
  'patients.view','patients.view_all','patients.create','patients.edit','patients.assign','patients.archive',
  'patient_documents.view','patient_documents.upload','patient_documents.download','patient_documents.replace','patient_documents.archive','patient_documents.delete',
  'patient_notes.view','patient_notes.create','patient_notes.edit','patient_notes.delete',
  'clinical_notes.view','clinical_notes.create','clinical_notes.edit','clinical_notes.delete','patient_activity.view',
  'patient_sessions.create','patient_sessions.edit','patient_sessions.cancel','patient_activity.view',
  'documents.employee.manage','documents.administration.manage','documents.operational_client.manage',
  'ideas.view','ideas.create','ideas.edit_own','ideas.comment','ideas.support',
  'customer_feedback.view',
  'doctor_scheduling.view','doctor_scheduling.manage_doctors','doctor_scheduling.create_appointments','doctor_scheduling.update_appointments','doctor_scheduling.cancel_appointments',
  'online_psychologists.manage',
  'appointments.view','appointments.create','appointments.update','appointments.reschedule','appointments.cancel','appointments.delete','appointments.update_status',
] as const;

export type PermissionCode = typeof permissionCatalogue[number];

export const adminRoutePermissions: Record<string, PermissionCode> = {
  '/admin': 'admin.access',
  '/admin/tasks': 'tasks.manage',
  '/admin/task-access': 'tasks.manage_access',
  '/admin/documents': 'documents.manage',
  '/admin/announcements': 'announcements.manage',
  '/admin/notifications': 'notifications.view',
  '/admin/chat': 'chat.use',
  '/admin/crm': 'crm.manage_all',
  '/admin/crm/import': 'crm.import',
  '/admin/access': 'roles.manage',
  '/admin/patients': 'patients.view',
};

export const superAdminNavigation = [
  { title: 'OVERVIEW', links: [{ label: 'Dashboard', href: '/admin', permission: 'admin.access' }] },
  { title: 'PEOPLE', links: [{ label: 'Employees', href: '/admin/employees', permission: 'employees.view' }] },
  { title: 'WORK MANAGEMENT', links: [{ label: 'Tasks', href: '/admin/tasks', permission: 'tasks.manage' }, { label: 'Task Access', href: '/admin/task-access', permission: 'tasks.manage_access' }, { label: 'Documents', href: '/admin/documents', permission: 'documents.manage' }] },
  { title: 'COMMUNICATION', links: [{ label: 'Chat', href: '/admin/chat', permission: 'chat.use' }, { label: 'Announcements', href: '/admin/announcements', permission: 'announcements.manage' }, { label: 'Notifications', href: '/admin/notifications', permission: 'notifications.view' }] },
  { title: 'CRM', links: [{ label: 'CRM Overview', href: '/admin/crm', permission: 'crm.manage_all' }, { label: 'Clients', href: '/admin/patients', permission: 'patients.view' }, { label: 'Import Leads', href: '/admin/crm/import', permission: 'crm.import' }, { label: 'Sales', href: '/admin/crm/sales', permission: 'crm.manage_all' }] },
  { title: 'FINANCE', links: [{ label: 'Finance Dashboard', href: '/admin/finance', permission: 'finance.view' }, { label: 'Income', href: '/admin/finance/income', permission: 'finance.view' }, { label: 'Expenses', href: '/admin/finance/expenses', permission: 'finance.view' }, { label: 'Invoices', href: '/admin/finance/invoices', permission: 'invoices.view' }, { label: 'Payroll', href: '/admin/finance/payroll', permission: 'payroll.view' }, { label: 'Reports', href: '/admin/finance/reports', permission: 'reports.view' }] },
  { title: 'ADMINISTRATION', links: [{ label: 'Roles & Access', href: '/admin/access', permission: 'roles.manage' }] },
] as const;
