import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminNavigation, adminRouteRequirement, filterNavigation, permissionAllows } from './permission-access';

describe('management calendar and meeting access', () => {
  it('exposes management routes through the admin shell', () => {
    expect(readFileSync(resolve(process.cwd(), 'src/app/admin/calendar/page.tsx'), 'utf8')).toContain("@/app/employee/calendar/page");
    expect(readFileSync(resolve(process.cwd(), 'src/app/admin/meetings/page.tsx'), 'utf8')).toContain("@/app/employee/meetings/page");
  });

  it('requires meeting permissions for both management routes', () => {
    const manager = new Set(['meetings.view', 'meetings.create', 'meetings.manage']);
    expect(permissionAllows(manager, adminRouteRequirement('/admin/calendar'))).toBe(true);
    expect(permissionAllows(manager, adminRouteRequirement('/admin/meetings'))).toBe(true);
    expect(permissionAllows(new Set(['dashboard.view']), adminRouteRequirement('/admin/meetings'))).toBe(false);
  });

  it('shows My Calendar and Meetings in management navigation', () => {
    const labels = filterNavigation(adminNavigation, new Set(['meetings.view'])).flatMap(group => group.links.map(link => link.label));
    expect(labels).toContain('My Calendar');
    expect(labels).toContain('Meetings');
  });
});
