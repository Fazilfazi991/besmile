import { describe, expect, it } from 'vitest';
import { hasTaskPermission, isActivePermissionGrant } from './task-permission-rules';

const now = new Date('2026-07-21T12:00:00Z');
const active = { permission_code: 'tasks.assign' as const, starts_at: '2026-07-01T00:00:00Z', expires_at: null, revoked_at: null };

describe('task assignment permissions', () => {
  it('gives Chairman and Director default authority', () => {
    expect(hasTaskPermission('chairman', 'tasks.assign', [], now)).toBe(true);
    expect(hasTaskPermission('director', 'tasks.manage_access', [], now)).toBe(true);
  });
  it('supports the default Fayiz and Diya-style active grants while denying ordinary staff', () => {
    expect(hasTaskPermission('staff', 'tasks.assign', [active], now)).toBe(true);
    expect(hasTaskPermission('staff', 'tasks.assign', [], now)).toBe(false);
  });
  it('denies expired and revoked temporary access', () => {
    expect(isActivePermissionGrant({ ...active, expires_at: '2026-07-20T00:00:00Z' }, now)).toBe(false);
    expect(isActivePermissionGrant({ ...active, revoked_at: '2026-07-20T00:00:00Z' }, now)).toBe(false);
  });
  it('does not let task assignment alone imply access management', () => {
    expect(hasTaskPermission('staff', 'tasks.manage_access', [active], now)).toBe(false);
  });
});
