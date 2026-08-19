export function defaultMeetingHostId(
  profileId: string | null | undefined,
  hasHostPermission: boolean,
  hostCandidates: readonly { id?: string | null }[],
) {
  if (!profileId || !hasHostPermission) return '';
  return hostCandidates.some((candidate) => candidate.id === profileId) ? profileId : '';
}
