import { describe, expect, it } from 'vitest';
import { adminNavigation, adminRouteRequirement, filterNavigation, permissionAllows } from './permission-access';

describe('management profile access', () => {
  it('allows management dashboard users to open their profile without security administration', () => {
    const permissions = new Set(['dashboard.view']);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/profile'))).toBe(true);
    expect(permissionAllows(permissions, adminRouteRequirement('/admin/access'))).toBe(false);
  });

  it('shows Profile but not Roles & Access for General Manager permissions', () => {
    const labels = filterNavigation(adminNavigation, new Set(['dashboard.view'])).flatMap(group => group.links.map(link => link.label));
    expect(labels).toContain('Profile');
    expect(labels).not.toContain('Roles & Access');
  });
});
