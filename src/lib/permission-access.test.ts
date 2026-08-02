import { describe, expect, it } from 'vitest';
import { adminNavigation, adminRouteRequirement, dashboardTitle, employeeNavigation, employeeRouteRequirement, filterNavigation, isManagementRole, isSecurityAdministratorRole, permissionAllows, workspaceLandingPath, workspaceTitle } from './permission-access';

describe('permission compatibility', () => {
  it('normalizes every management role into the management workspace', () => {
    expect(isManagementRole('General Manager')).toBe(true);
    expect(isManagementRole('general-manager')).toBe(true);
    expect(isManagementRole('GENERAL_MANAGER')).toBe(true);
    expect(isManagementRole('Chairman')).toBe(true);
    expect(isManagementRole('Director')).toBe(true);
    expect(isManagementRole('Social Worker')).toBe(false);
    expect(isManagementRole('Psychologist')).toBe(false);
    expect(workspaceLandingPath('General Manager')).toBe('/admin');
    expect(workspaceLandingPath('Social Worker')).toBe('/employee/dashboard');
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

  it('shows the General Manager management navigation from granular grants', () => {
    const granted = new Set(['dashboard.view', 'employees.view', 'leads.view', 'tasks.assign', 'documents.employee.manage', 'chat.use', 'announcements.manage', 'notifications.view', 'finance.dashboard.view', 'income.view', 'expenses.view', 'payroll.view', 'invoices.view', 'reports.finance.view']);
    const labels = filterNavigation(adminNavigation, granted).flatMap(group => group.links.map(link => link.label));
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Employees', 'Leads Management', 'Tasks', 'Documents', 'Finance Dashboard', 'Income', 'Expenses', 'Payroll', 'Invoices', 'Reports']));
  });
  it('accepts granular dashboard and finance permissions without legacy aliases', () => {
    expect(permissionAllows(new Set(['dashboard.view']), adminRouteRequirement('/admin'))).toBe(true);
    expect(permissionAllows(new Set(['finance.dashboard.view']), adminRouteRequirement('/admin/finance'))).toBe(true);
    expect(permissionAllows(new Set(['payroll.view']), adminRouteRequirement('/admin/finance/payroll'))).toBe(true);
  });

  it('requires employees.create for the employee creation route', () => {
    expect(permissionAllows(new Set(['employees.view']), adminRouteRequirement('/admin/employees/new'))).toBe(false);
    expect(permissionAllows(new Set(['employees.create']), adminRouteRequirement('/admin/employees/new'))).toBe(true);
    expect(permissionAllows(new Set(['employees.edit']), adminRouteRequirement('/admin/employees/new'))).toBe(false);
    expect(permissionAllows(new Set(['employees.view']), adminRouteRequirement('/admin/employees/example'))).toBe(true);
  });

  it('does not let a team CRM view permission satisfy finance routes', () => {
    const granted = new Set(['crm.view_team']);
    expect(permissionAllows(granted, adminRouteRequirement('/admin/crm'))).toBe(true);
    expect(permissionAllows(granted, adminRouteRequirement('/admin/finance'))).toBe(false);
  });

  it('shows interns only assigned-patient and universal employee links', () => {
    const groups = filterNavigation(employeeNavigation, new Set(['patients.view_assigned', 'patient_documents.view']));
    const labels = groups.flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toEqual(expect.arrayContaining(['Assigned Patients', 'Documents', 'Notifications', 'Profile']));
    expect(labels).not.toContain('Dashboard');
    expect(permissionAllows(new Set(['patients.view_assigned']), employeeRouteRequirement('/employee/patients/example'))).toBe(true);
  });

  it('limits guest sales navigation to CRM and universal employee links', () => {
    const groups = filterNavigation(employeeNavigation, new Set(['leads.view', 'leads.edit', 'sales.view', 'sales.edit']));
    const labels = groups.flatMap((group) => group.links.map((link) => link.label));
    expect(labels).toEqual(expect.arrayContaining(['CRM Dashboard', 'My Leads', 'My Follow-ups', 'My Sales', 'Notifications', 'Profile']));
    expect(labels).not.toEqual(expect.arrayContaining(['Dashboard', 'Attendance', 'Leave', 'Documents']));
  });
});
