export type PermissionGrant = { permission_code: 'tasks.assign' | 'tasks.manage_access'; starts_at: string; expires_at: string | null; revoked_at: string | null };

export function isActivePermissionGrant(grant: PermissionGrant, now = new Date()) {
  return !grant.revoked_at && new Date(grant.starts_at) <= now && (!grant.expires_at || new Date(grant.expires_at) > now);
}

export function hasTaskPermission(role: string, permissionCode: 'tasks.assign' | 'tasks.manage_access', grants: PermissionGrant[], now = new Date()) {
  if (role === 'chairman' || role === 'director') return true;
  return grants.some(grant => grant.permission_code === permissionCode && isActivePermissionGrant(grant, now));
}
