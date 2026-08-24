import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeNavigationHref, adminNavigation, adminRouteRequirement, employeeNavigation, filterNavigation, navigationForProfile, permissionAllows, sectionNavigation } from './permission-access';

const labels = (groups: ReturnType<typeof filterNavigation>) => groups.flatMap(group => group.links.map(link => link.label));
const sidebarSource = readFileSync(resolve(process.cwd(), 'src/components/permission-sidebar.tsx'), 'utf8');

describe('Batch 13 sidebar navigation architecture', () => {
  it('groups management navigation by business function', () => {
    expect(adminNavigation.map(group => group.title)).toEqual([
      'DASHBOARD', 'HR & EMPLOYEE MANAGEMENT', 'WORK MANAGEMENT', 'CLIENT & CRM',
      'FINANCE & ACCOUNTS', 'DOCUMENTS & REPORTS', 'COMMUNICATION', 'ADMINISTRATION / SYSTEM',
    ]);
  });

  it('derives compact sidebar sections from the canonical, permission-filtered links', () => {
    const sections = sectionNavigation(filterNavigation(adminNavigation, new Set(['dashboard.view', 'employees.view', 'crm.view_team', 'finance.dashboard.view', 'roles.manage'])));
    expect(sections.map(section => section.title)).toEqual(['Overview', 'Operations', 'CRM', 'Finance', 'Data & Settings']);
    expect(sections.find(section => section.title === 'CRM')?.links.map(link => link.label)).toEqual(['CRM Overview', 'Leads', 'Follow-ups', 'Sales']);
    expect(sections.find(section => section.title === 'Data & Settings')?.links.map(link => link.label)).toEqual(['My Profile', 'Roles & Access']);
  });

  it('keeps ordinary staff navigation limited to authorized self-service work', () => {
    const visible = filterNavigation(employeeNavigation, new Set(['dashboard.view', 'tasks.view_self', 'attendance.self', 'leave.self']));
    // Chat and Meetings are universal active-employee workspaces; the
    // navigation must keep them available even when a role has no optional
    // module grants in this synthetic permission set.
    expect(labels(visible)).toEqual(['Dashboard', 'My Tasks', 'My Calendar', 'Meetings', 'My Attendance', 'Leave Requests', 'Chat', 'Notifications', 'My Profile']);
    expect(labels(visible)).not.toEqual(expect.arrayContaining(['Employees', 'Staff Attendance', 'Finance Dashboard', 'Roles & Access', 'CRM Overview']));
  });

  it('shows GM management areas only from effective permissions', () => {
    const permissions = new Set(['dashboard.view', 'employees.view', 'attendance.self', 'attendance.view', 'leave.review', 'tasks.assign', 'patients.view', 'crm.view_team', 'doctor_scheduling.view', 'payroll.view', 'reports.view']);
    const visible = filterNavigation(navigationForProfile('general_manager'), permissions);
    expect(labels(visible)).toEqual(expect.arrayContaining(['Dashboard', 'Employees', 'My Attendance', 'Staff Attendance', 'Leave Approvals', 'Tasks', 'Clients', 'CRM Overview', 'Appointment & Scheduling', 'Payroll', 'Operational Reports']));
    expect(labels(visible)).not.toEqual(expect.arrayContaining(['Finance Dashboard', 'Income', 'Expenses', 'Roles & Access']));
  });

  it.each(['general_manager', 'director', 'chairman'])('uses permissions, not the %s role name, for sensitive links', role => {
    const visible = filterNavigation(navigationForProfile(role), new Set(['dashboard.view']));
    expect(labels(visible)).toEqual(['Dashboard', 'My Profile']);
  });

  it('keeps Finance and CRM absent when their effective permissions are denied', () => {
    const visible = filterNavigation(adminNavigation, new Set(['dashboard.view']));
    expect(visible.find(group => group.title === 'FINANCE & ACCOUNTS')).toBeUndefined();
    expect(visible.find(group => group.title === 'CLIENT & CRM')).toBeUndefined();
  });

  it.each([
    ['director', new Set(['dashboard.view', 'employees.view', 'crm.view_team', 'finance.dashboard.view']), ['Overview', 'Operations', 'CRM', 'Finance', 'Data & Settings']],
    ['general_manager', new Set(['dashboard.view', 'employees.view', 'tasks.assign', 'leave.review']), ['Overview', 'Operations', 'Work Management', 'Data & Settings']],
    ['assistant_manager', new Set(['dashboard.view', 'admin.shell', 'doctor_scheduling.view', 'psychologist_payments.view']), ['Overview', 'Work Management', 'Finance', 'Data & Settings']],
    ['psychologist', new Set(['dashboard.view', 'attendance.self', 'tasks.view_self', 'doctor_scheduling.view']), ['Overview', 'Work Management', 'Data & Settings']],
    ['guest_sales', new Set(['dashboard.view', 'crm.view_assigned']), ['Overview', 'Work Management', 'CRM', 'Data & Settings']],
    ['intern', new Set(['dashboard.view', 'tasks.view_self']), ['Overview', 'Work Management', 'Data & Settings']],
  ] as const)('keeps %s sidebar sections limited to its effective permission cards', (role, permissions, expectedSections) => {
    const sections = sectionNavigation(filterNavigation(navigationForProfile(role), permissions));
    expect(sections.map(section => section.title)).toEqual(expectedSections);
    expect(sections.every(section => section.links.length > 0)).toBe(true);
  });

  it('reflects direct grants and direct revokes from the canonical permission set', () => {
    const effectivePermissions = new Set(['dashboard.view']);
    expect(labels(filterNavigation(adminNavigation, effectivePermissions))).not.toContain('Finance Dashboard');
    effectivePermissions.add('finance.dashboard.view');
    expect(labels(filterNavigation(adminNavigation, effectivePermissions))).toContain('Finance Dashboard');
    effectivePermissions.delete('finance.dashboard.view');
    expect(labels(filterNavigation(adminNavigation, effectivePermissions))).not.toContain('Finance Dashboard');
  });

  it('aligns dashboard and staff-attendance links with their route contracts', () => {
    expect(permissionAllows(new Set(['dashboard.view']), adminRouteRequirement('/admin'))).toBe(true);
    expect(permissionAllows(new Set(['admin.access']), adminRouteRequirement('/admin'))).toBe(true);
    expect(permissionAllows(new Set(), adminRouteRequirement('/admin'))).toBe(false);
    expect(permissionAllows(new Set(['attendance.view']), adminRouteRequirement('/admin/attendance'))).toBe(true);
    expect(permissionAllows(new Set(['attendance.view_team']), adminRouteRequirement('/admin/attendance'))).toBe(false);
  });

  it('selects the most specific active item for nested, detail, and create routes', () => {
    expect(activeNavigationHref('/admin/employees/123', adminNavigation)).toBe('/admin/employees');
    expect(activeNavigationHref('/admin/employees/new', adminNavigation)).toBe('/admin/employees');
    expect(activeNavigationHref('/admin/crm/leads/123', adminNavigation)).toBe('/admin/crm/leads');
    expect(activeNavigationHref('/admin/finance/invoices/new', adminNavigation)).toBe('/admin/finance/invoices');
    expect(activeNavigationHref('/admin/ideas/categories', adminNavigation)).toBe('/admin/ideas/categories');
  });

  it('contains no dead menu destinations on the Batch 13 baseline', () => {
    for (const link of [...adminNavigation, ...employeeNavigation].flatMap(group => group.links)) {
      expect(existsSync(resolve(process.cwd(), 'src/app', link.href.replace(/^\//, ''), 'page.tsx')), link.href).toBe(true);
    }
  });

  it('preserves accessible desktop collapse and mobile close behavior', () => {
    expect(sidebarSource).toContain("aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}");
    expect(sidebarSource).toContain('aria-label={collapsed ? section.title : undefined}');
    expect(sidebarSource).toContain('title={collapsed ? section.title : undefined}');
    expect(sidebarSource).toContain('if (event.key === \'Escape\') setMobileOpen(false)');
    expect(sidebarSource).toContain('aria-label="Close navigation"');
    expect(sidebarSource).toContain('onClick={() => setMobileOpen(false)}');
    expect(sidebarSource).toContain('nav-card-grid');
    expect(sidebarSource).toContain('setOpenSection((current) => current === section.title ? null : section.title)');
  });
});
