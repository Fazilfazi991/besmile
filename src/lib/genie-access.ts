export type GenieAccessProfile = {
  status?: string | null;
  is_employee?: boolean | null;
};

export function canUseGenie(profile: GenieAccessProfile | null | undefined) {
  if (!profile) return false;
  if (profile.status === 'inactive' || profile.status === 'terminated') return false;
  return profile.is_employee !== false;
}
