export type ReportingProfile = { id: string; manager_id: string | null };

export function wouldCreateReportingCycle(profileId: string, managerId: string | null, profiles: ReportingProfile[]) {
  if (!managerId || managerId === profileId) return managerId === profileId;
  const managerById = new Map(profiles.map((profile) => [profile.id, profile.manager_id]));
  const seen = new Set<string>();
  let current: string | null | undefined = managerId;
  while (current) {
    if (current === profileId || seen.has(current)) return true;
    seen.add(current);
    current = managerById.get(current);
  }
  return false;
}

export function isActiveHoliday(holiday: { is_active?: boolean }) {
  return holiday.is_active !== false;
}
