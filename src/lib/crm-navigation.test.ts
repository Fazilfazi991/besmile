import { describe, expect, it } from 'vitest';
import { adminNavigation, filterNavigation } from './permission-access';

describe('CRM navigation', () => {
  it('shows the complete management CRM structure for a lead manager', () => {
    const groups = filterNavigation(adminNavigation, new Set(['leads.view', 'sales.view']));
    const crm = groups.find(group => group.title === 'CLIENT & CRM');
    expect(crm?.links.map(link => link.label)).toEqual(expect.arrayContaining(['CRM Overview', 'Leads', 'Follow-ups', 'Sales']));
  });

  it('does not show management CRM links without CRM permissions', () => {
    expect(filterNavigation(adminNavigation, new Set(['dashboard.view'])).find(group => group.title === 'CRM')).toBeUndefined();
  });
});
