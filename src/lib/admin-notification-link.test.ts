import { describe, expect, it } from 'vitest';
import { adminNotificationTarget } from './admin-notification-link';

describe('admin notification targets', () => {
  it('keeps GM users inside the admin announcement workspace', () => {
    expect(adminNotificationTarget('/employee/announcements')).toBe('/admin/announcements');
    expect(adminNotificationTarget('/employee/announcements/example')).toBe('/admin/announcements/example');
  });

  it('preserves request context while mapping employee leave links', () => {
    expect(adminNotificationTarget('/employee/leaves?request=leave-123')).toBe('/admin/leaves?request=leave-123');
  });

  it('does not alter already-admin or external links', () => {
    expect(adminNotificationTarget('/admin/documents')).toBe('/admin/documents');
    expect(adminNotificationTarget('https://example.test/resource')).toBe('https://example.test/resource');
  });
});
