export const DAILY_WORK_MAX_LENGTH = 4000;

export function dailyWorkValidationMessage(summary: string) {
  const normalized = summary.trim();
  if (!normalized) return "Describe the work completed before saving.";
  if (normalized.length > DAILY_WORK_MAX_LENGTH) return `Daily work updates must be ${DAILY_WORK_MAX_LENGTH.toLocaleString()} characters or fewer.`;
  return null;
}
