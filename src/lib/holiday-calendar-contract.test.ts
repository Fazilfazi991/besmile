import { describe, expect, it } from 'vitest';
import { adminRouteRequirement, employeeNavigation, employeeRouteRequirement, navigationPermissionCodes } from '@/lib/permission-access';

describe('Holiday Calendar navigation contract', () => {
  it('keeps the Holiday Calendar distinct from My Calendar routes', () => {
    expect(adminRouteRequirement('/admin/holidays')).toEqual({ anyOf: ['holiday_calendar.manage'] });
    expect(employeeRouteRequirement('/employee/holidays')).toBeUndefined();
    expect(navigationPermissionCodes).toContain('holiday_calendar.manage');
    expect(employeeNavigation.flatMap((group) => group.links).find((link) => link.label === 'Holiday Calendar')?.href).toBe('/employee/holidays');
  });
});
