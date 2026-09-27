import { isManagementRole, normalizeRole } from './permission-access';

export type GenieAccessProfile = {
  status?: string | null;
  is_employee?: boolean | null;
  role?: string | null;
};

export function canUseGenie(profile: GenieAccessProfile | null | undefined) {
  if (!profile) return false;
  if (profile.status === 'inactive' || profile.status === 'terminated') return false;
  const role = normalizeRole(profile.role);
  if (role === 'super_admin' || isManagementRole(role)) return true;
  return profile.is_employee !== false && Boolean(role);
}
