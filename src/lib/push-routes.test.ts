import { describe, expect, it } from 'vitest';
import { safePushRoute, workspaceForRole } from '@/lib/push-routes';

describe('push notification routes', () => {
  it('keeps employee notifications inside the employee workspace', () => {
    expect(safePushRoute('/employee/tasks', 'employee')).toBe('/employee/tasks');
    expect(safePushRoute('/admin/finance', 'employee')).toBe('/employee/notifications');
  });

  it('keeps super admin notifications inside the admin workspace', () => {
    expect(safePushRoute('/admin/crm/leads/123', 'admin')).toBe('/admin/crm/leads/123');
    expect(safePushRoute('/employee/tasks', 'admin')).toBe('/admin/notifications');
  });

  it('rejects external and malformed routes', () => {
    expect(safePushRoute('//malicious.example', 'employee')).toBe('/employee/notifications');
    expect(safePushRoute('https://malicious.example', 'admin')).toBe('/admin/notifications');
  });

  it('maps only Super Admin to the admin push workspace', () => {
    expect(workspaceForRole('super_admin')).toBe('admin');
    expect(workspaceForRole('chairman')).toBe('employee');
  });
});
