import { describe, expect, it } from 'vitest';
import { adminNavigation, adminRouteRequirement, dashboardTitle, employeeNavigation, employeeRouteRequirement, filterNavigation, isManagementRole, isSecurityAdministratorRole, navigationForProfile, permissionAllows, workspaceLandingPath, workspaceTitle } from './permission-access';
import { permissionCatalogue } from './permission-catalogue';

describe('permission compatibility', () => {
  it('normalizes every management role into the management workspace', () => {
    expect(isManagementRole('General Manager')).toBe(true);
    expect(isManagementRole('general-manager')).toBe(true);
    expect(isManagementRole('GENERAL_MANAGER')).toBe(true);
    expect(isManagementRole('Chairman')).toBe(true);
    expect(isManagementRole('Director')).toBe(true);
    expect(isManagementRole('Psychologist')).toBe(false);
    expect(workspaceLandingPath('General Manager')).toBe('/admin');
    expect(workspaceLandingPath('Psychologist')).toBe('/employee/dashboard');
    expect(workspaceLandingPath('Intern')).toBe('/employee/dashboard');
    expect(workspaceLandingPath('Guest Sales')).toBe('/employee/dashboard');
  });

  it('uses role-aware dashboard and workspace labels without elevating management roles', () => {
    expect(dashboardTitle('general_manager')).toBe('General Manager Dashboard');
    expect(dashboardTitle('General Manager')).not.toBe('Super Admin Dashboard');
    expect(workspaceTitle('general_manager')).toBe('General Manager Workspace');
    expect(dashboardTitle('super_admin')).toBe('Super Admin Dashboard');
    expect(workspaceTitle('super_admin')).toBe('Super Admin Workspace');
  });

  it('reserves security administration for an actual Super Admin role', () => {
    expect(isSecurityAdministratorRole('super_admin')).toBe(true);
    expect(isSecurityAdministratorRole('General Manager')).toBe(false);
    expect(isSecurityAdministratorRole('Chairman')).toBe(false);
    expect(isSecurityAdministratorRole('Director')).toBe(false);
    expect(permissionAllows(new Set(['dashboard.view', 'employees.view']), adminRouteRequirement('/admin/access'))).toBe(false);
  });

  it('requires admin access for the admin root dashboard', () => {
    expect(permissionAllows(new Set(['dashboard.view', 'admin.shell']), adminRouteRequirement('/admin'))).toBe(false);
    expect(permissionAllows(new Set(['admin.access']), adminRouteRequirement('/admin'))).toBe(true);
  });

  it('shows Administration Admin operational links without finance or access management', () => {
    const administrationAdmin = new Set([
      'admin.shell', 'dashboard.view', 'crm.manage_all', 'leads.view', 'sales.view',
      'employees.view', 'patients.view', 'patients.view_all', 'attendance.view',
      'leave.self', 'leave.view', 'tasks.assign', 'documents.employee.manage',
      'documents.administration.manage', 'announcements.view', 'notifications.view',
      'chat.use', 'ideas.view',
    ]);
    const labels = filterNavigation(employeeNavigation, administrationAdmin).flatMap(group => group.links.map(link => link.label));
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'CRM Dashboard', 'Leads', 'Follow-ups', 'Clients', 'Employees', 'Operational Documents', 'Attendance', 'Leave', 'Chat', 'Profile']));
    expect(labels).not.toEqual(expect.arrayContaining(['Finance Dashboard', 'Payroll', 'Roles & Access', 'Task Assignment Access']));
    expect(permissionAllows(administrationAdmin, adminRouteRequirement('/admin/finance'))).toBe(false);
    expect(permissionAllows(administrationAdmin, adminRouteRequirement('/admin/access'))).toBe(false);
    expect(permissionAllows(administrationAdmin, adminRouteRequirement('/admin/leaves'))).toBe(false);
    expect(navigationForProfile('staff')).toBe(employeeNavigation);
  });

  it('shows the General Manager operations navigation from granular grants', () => {
    const granted = new Set(['dashboard.view', 'employees.view', 'patients.view', 'leads.view', 'tasks.assign', 'documents.employee.manage', 'chat.use', 'announcements.manage', 'notifications.view', 'finance.dashboard.view', 'income.view', 'expenses.view', 'payroll.view', 'invoices.view', 'reports.finance.view']);
    const labels = filterNavigation(adminNavigation, granted).flatMap(group => group.links.map(link => link.label));
    expect(navigationForProfile('general_manager')).toBe(adminNavigation);
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Employees', 'Clients', 'Operational Documents', 'Leads Management', 'Tasks', 'Finance Dashboard', 'Income', 'Expenses', 'Payroll', 'Invoices', 'Reports']));
    expect(labels).not.toContain('Roles & Access');
  });
  it('accepts granular dashboard and finance permissions without legacy aliases', () => {
    expect(permissionAllows(new Set(['admin.access']), adminRouteRequirement('/admin'))).toBe(true);
    expect(permissionAllows(new Set(['finance.dashboard.view']), adminRouteRequirement('/admin/finance'))).toBe(true);
    expect(permissionAllows(new Set(['payroll.view']), adminRouteRequirement('/admin/finance/payroll'))).toBe(true);
  });

  it('requires employees.create for the employee creation route', () => {
    expect(permissionAllows(new Set(['employees.view']), adminRouteRequirement('/admin/employees/new'))).toBe(false);
    expect(permissionAllows(new Set(['employees.create']), adminRouteRequirement('/admin/employees/new'))).toBe(true);
    expect(permissionAllows(new Set(['employees.edit']), adminRouteRequirement('/admin/employees/new'))).toBe(false);
    expect(permissionAllows(new Set(['employees.view']), adminRouteRequirement('/admin/employees/example'))).toBe(true);
  });

  it('keeps a personal attendance route available to GM self-service only', () => {
    expect(permissionAllows(new Set(['attendance.self']), adminRouteRequirement('/admin/my-attendance'))).toBe(true);
    expect(permissionAllows(new Set(['attendance.view']), adminRouteRequirement('/admin/my-attendance'))).toBe(false);
    expect(permissionAllows(new Set(['employees.view']), adminRouteRequirement('/admin/my-attendance'))).toBe(false);
    const labels = filterNavigation(adminNavigation, new Set(['attendance.self'])).flatMap(group => group.links.map(link => link.label));
    expect(labels).toContain('My Attendance');
    expect(labels).not.toContain('Attendance');
  });

  it('keeps company staff attendance behind the existing company-view permission', () => {
    const generalManager = new Set(['attendance.self', 'attendance.view']);
    const staff = new Set(['attendance.self']);
    expect(permissionAllows(generalManager, adminRouteRequirement('/admin/attendance'))).toBe(true);
    expect(permissionAllows(staff, adminRouteRequirement('/admin/attendance'))).toBe(false);
    const gmLabels = filterNavigation(adminNavigation, generalManager).flatMap(group => group.links.map(link => link.label));
    const staffLabels = filterNavigation(adminNavigation, staff).flatMap(group => group.links.map(link => link.label));
    expect(gmLabels).toEqual(expect.arrayContaining(['My Attendance', 'Staff Attendance']));
    expect(staffLabels).not.toContain('Staff Attendance');
  });

  it('exposes leave approvals only to reviewers', () => {
    expect(permissionAllows(new Set(['leave.approve']), adminRouteRequirement('/admin/leaves'))).toBe(true);
    expect(permissionAllows(new Set(['leave.self']), adminRouteRequirement('/admin/leaves'))).toBe(false);
    const labels = filterNavigation(adminNavigation, new Set(['leave.review'])).flatMap(group => group.links.map(link => link.label));
    expect(labels).toContain('Leave approvals');
  });

  it('does not let a team CRM view permission satisfy finance routes', () => {
    const granted = new Set(['crm.view_team']);
    expect(permissionAllows(granted, adminRouteRequirement('/admin/crm'))).toBe(true);
    expect(permissionAllows(granted, adminRouteRequirement('/admin/finance'))).toBe(false);
  });

  it('keeps customer feedback behind its dedicated permission in navigation and direct routes', () => {
    expect(permissionCatalogue).toContain('customer_feedback.view');
    expect(permissionAllows(new Set(['customer_feedback.view']), adminRouteRequirement('/admin/customer-feedback'))).toBe(true);
    expect(permissionAllows(new Set(['dashboard.view']), adminRouteRequirement('/admin/customer-feedback'))).toBe(false);
    const labels = filterNavigation(adminNavigation, new Set(['customer_feedback.view'])).flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toContain('Customer Feedback');
    const employeeLabels = filterNavigation(employeeNavigation, new Set(['customer_feedback.view'])).flatMap((group) => group.links.map((link) => link.label));
    expect(employeeLabels).not.toContain('Customer Feedback');
  });

  it('shows interns only assigned-patient and universal employee links', () => {
    const groups = filterNavigation(employeeNavigation, new Set(['patients.view_assigned', 'patient_documents.view']));
    const labels = groups.flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toEqual(expect.arrayContaining(['Assigned Clients', 'Documents', 'Notifications', 'Profile']));
    expect(labels).not.toContain('Clients');
    expect(labels).not.toContain('Dashboard');
    expect(permissionAllows(new Set(['patients.view_assigned']), employeeRouteRequirement('/employee/patients'))).toBe(false);
    expect(permissionAllows(new Set(['patients.view_assigned']), employeeRouteRequirement('/employee/patients/example'))).toBe(true);
    expect(permissionAllows(new Set(['patients.view_assigned']), employeeRouteRequirement('/employee/assigned-patients'))).toBe(true);
  });

  it('splits main Patients from Assigned Patients for patient-care roles', () => {
    const psychologist = new Set(['patients.view', 'patients.view_assigned', 'ideas.view']);
    const psychologistLabels = filterNavigation(employeeNavigation, psychologist).flatMap((group) => group.links.map((link) => link.label));
    expect(psychologistLabels).toEqual(expect.arrayContaining(['Clients', 'Assigned Clients', 'Innovation Hub']));

    const socialWorker = new Set(['patients.view', 'ideas.view']);
    const socialWorkerLabels = filterNavigation(employeeNavigation, socialWorker).flatMap((group) => group.links.map((link) => link.label));
    expect(socialWorkerLabels).toEqual(expect.arrayContaining(['Clients', 'Innovation Hub']));
    expect(socialWorkerLabels).not.toContain('Assigned Clients');

    const guestSales = new Set(['ideas.view', 'crm.view_assigned']);
    const guestSalesLabels = filterNavigation(employeeNavigation, guestSales).flatMap((group) => group.links.map((link) => link.label));
    expect(guestSalesLabels).toContain('Innovation Hub');
    expect(guestSalesLabels).not.toContain('Clients');
    expect(guestSalesLabels).not.toContain('Assigned Clients');
  });

  it('keeps read-only announcements out of the employee sidebar', () => {
    const labels = filterNavigation(employeeNavigation, new Set(['announcements.view', 'notifications.view', 'chat.use'])).flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toEqual(expect.arrayContaining(['Notifications', 'Chat', 'Profile']));
    expect(labels).not.toContain('Announcements');
    expect(permissionAllows(new Set(['announcements.view']), employeeRouteRequirement('/employee/announcements/example'))).toBe(true);
  });

  it('limits guest sales navigation to CRM and universal employee links', () => {
    const groups = filterNavigation(employeeNavigation, new Set(['leads.view', 'leads.edit', 'sales.view', 'sales.edit']));
    const labels = groups.flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toEqual(expect.arrayContaining(['CRM Dashboard', 'My Leads', 'My Follow-ups', 'My Sales', 'Notifications', 'Profile']));
    expect(labels).not.toEqual(expect.arrayContaining(['Dashboard', 'Attendance', 'Leave', 'Documents']));
  });

  it('keeps assigned clinical CRM separate from sales and admin CRM', () => {
    const scoped = new Set(['crm.view_assigned']);
    const labels = filterNavigation(employeeNavigation, scoped).flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toEqual(expect.arrayContaining(['CRM Dashboard', 'My Leads', 'My Follow-ups']));
    expect(labels).not.toContain('My Sales');
    expect(permissionAllows(scoped, employeeRouteRequirement('/employee/crm'))).toBe(true);
    expect(permissionAllows(scoped, employeeRouteRequirement('/employee/crm/leads/example'))).toBe(true);
    expect(permissionAllows(scoped, employeeRouteRequirement('/employee/crm/sales'))).toBe(false);
    expect(permissionAllows(scoped, adminRouteRequirement('/admin/crm'))).toBe(false);
    expect(permissionAllows(scoped, adminRouteRequirement('/admin/crm/import'))).toBe(false);
  });

  it('keeps own tasks and own leave out of management routes', () => {
    expect(permissionAllows(new Set(['tasks.view_self']), employeeRouteRequirement('/employee/tasks'))).toBe(true);
    expect(permissionAllows(new Set(['tasks.view_self']), employeeRouteRequirement('/employee/tasks/manage'))).toBe(false);
    expect(permissionAllows(new Set(['tasks.view_self']), adminRouteRequirement('/admin/tasks'))).toBe(false);
    expect(permissionAllows(new Set(['leave.self']), employeeRouteRequirement('/employee/leaves'))).toBe(true);
    expect(permissionAllows(new Set(['leave.self']), adminRouteRequirement('/admin/leaves'))).toBe(false);
  });
});
