import { describe, expect, it } from 'vitest';
import { activeNavigationHref, adminNavigation, employeeNavigation, filterNavigation, sectionNavigation } from './permission-access';

describe('Performance and Communication navigation split', () => {
  it('renders the ordered management menus and their existing destinations', () => {
    const permissions = new Set([
      'admin.access', 'employees.view', 'attendance.view', 'leave.review', 'tasks.assign',
      'meetings.view', 'ideas.view', 'doctor_scheduling.view', 'customer_feedback.view',
      'chat.use', 'announcements.manage', 'notifications.view', 'crm.view_team',
      'finance.dashboard.view', 'roles.manage',
    ]);
    const sections = sectionNavigation(filterNavigation(adminNavigation, permissions));
    expect(sections.map(section => section.title)).toEqual([
      'Overview', 'Operations', 'Performance', 'Communication', 'Genie', 'CRM', 'Finance', 'Data & Settings',
    ]);
    expect(sections.find(section => section.title === 'Performance')?.links.map(link => link.label)).toEqual([
      'Staff Attendance', 'Daily Work Updates', 'My Calendar', 'Meetings', 'Leave Approvals', 'Tasks',
      'Appointment & Scheduling', 'Innovation Hub',
    ]);
    expect(sections.find(section => section.title === 'Communication')?.links.map(link => link.label)).toEqual([
      'Customer Feedback', 'Chat', 'Announcements', 'Notifications',
    ]);
    expect(sections.find(section => section.title === 'Genie')?.links.map(link => link.label)).toEqual(['Genie']);
    expect(sections.some(section => section.title === 'Work Management')).toBe(false);
  });

  it('keeps restricted staff filtering and hides empty parents', () => {
    const sections = sectionNavigation(filterNavigation(adminNavigation, new Set(['notifications.view'])));
    expect(sections.map(section => section.title)).toEqual(['Communication', 'Genie']);
    expect(sections.find(section => section.title === 'Communication')?.links.map(link => link.label)).toEqual(['Notifications']);
    expect(sections.find(section => section.title === 'Genie')?.links.map(link => link.label)).toEqual(['Genie']);
    expect(sections.every(section => section.links.length > 0)).toBe(true);
  });

  it('keeps active destinations unchanged for both new parents', () => {
    expect(activeNavigationHref('/admin/attendance', adminNavigation)).toBe('/admin/attendance');
    expect(activeNavigationHref('/admin/chat', adminNavigation)).toBe('/admin/chat');
    expect(activeNavigationHref('/admin/notifications', adminNavigation)).toBe('/admin/notifications');
  });

  it('keeps Genie as one direct top-level destination in both workspace contexts', () => {
    const adminGenie = sectionNavigation(filterNavigation(adminNavigation, new Set())).find(section => section.title === 'Genie');
    const employeeGenie = sectionNavigation(filterNavigation(employeeNavigation, new Set())).find(section => section.title === 'Genie');

    expect(adminGenie?.links).toEqual([expect.objectContaining({ label: 'Genie', href: '/admin/genie' })]);
    expect(employeeGenie?.links).toEqual([expect.objectContaining({ label: 'Genie', href: '/employee/genie' })]);
    expect(activeNavigationHref('/admin/genie', adminNavigation)).toBe('/admin/genie');
    expect(activeNavigationHref('/employee/genie', employeeNavigation)).toBe('/employee/genie');
  });
});
