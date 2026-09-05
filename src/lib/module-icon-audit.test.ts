import { describe, expect, it } from 'vitest';
import { SEMANTIC_ICON_NAMES, iconNameForLabel } from './module-icon-map';
import { adminNavigation, employeeNavigation } from './permission-access';

const firstClassLabels = [
  'Overview', 'Operations', 'Work Management', 'Communication', 'CRM', 'Finance',
  'Data & Settings', 'All Modules', 'Create', 'Teams',
  ...[...adminNavigation, ...employeeNavigation].flatMap(group => group.links.map(link => link.label)),
];

const intentionalConceptGroups = [
  ['Overview', 'Dashboard', 'Home'],
  ['Work Management', 'My Work'],
  ['Employees', 'People'],
  ['My Profile', 'Profile'],
  ['Staff Attendance', 'Attendance'],
  ['Leave Approvals', 'Leave approvals', 'Leave requests'],
  ['Leave Requests', 'My Leave', 'Leave', 'Request leave'],
  ['Tasks', 'Task', 'My Tasks'],
  ['Calendar', 'My Calendar'],
  ['Meetings', 'Meeting'],
  ['Appointment & Scheduling', 'Scheduling'],
  ['Innovation Hub', 'Submit idea'],
  ['Chat', 'Teams'],
  ['Announcements', 'Announcement'],
  ['Customer Feedback', 'Feedback'],
  ['CRM Overview', 'CRM Dashboard'],
  ['Leads', 'My Leads', 'Leads Management', 'New lead'],
  ['Follow-ups', 'My Follow-ups'],
  ['Sales', 'My Sales'],
  ['Clients', 'Client', 'Patients', 'Patient'],
  ['Assigned Clients', 'Assigned client'],
  ['Income', 'Revenue'],
  ['Expenses', 'Expense'],
  ['Invoices', 'Create invoice'],
  ['Payroll', 'Salary'],
  ['Finance Reports', 'Reports', 'Operational Reports', 'View reports'],
  ['Official Documents', 'Document', 'Document reviews'],
  ['Operational Documents', 'My Documents', 'Documents'],
  ['Roles & Access', 'Grant access'],
  ['Settings', 'System'],
];

describe('semantic module icon audit', () => {
  it('assigns every exposed first-class destination explicitly', () => {
    const assignments = [...new Set(firstClassLabels)].sort().map(label => ({
      label,
      icon: iconNameForLabel(label),
    }));
    console.table(assignments);
    expect(assignments.filter(item => item.icon === 'PanelsTopLeft')).toEqual([]);
  });

  it('only shares icons among intentional same-concept aliases', () => {
    const byIcon = Object.entries(SEMANTIC_ICON_NAMES).reduce<Record<string, string[]>>(
      (result, [label, icon]) => ({ ...result, [icon]: [...(result[icon] ?? []), label] }),
      {},
    );
    const suspicious = Object.entries(byIcon)
      .filter(([, labels]) => labels.length > 1)
      .filter(([, labels]) => !intentionalConceptGroups.some(group => labels.every(label => group.includes(label))));
    expect(suspicious).toEqual([]);
  });
});
