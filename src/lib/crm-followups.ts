export function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  return `${value}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] || 'th'}`;
}

export function followupLabel(value: number | null | undefined) {
  return value && value > 0 ? `${ordinal(value)} Follow-up` : 'Unnumbered follow-up';
}

export function nextFollowupNumber(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === 'number' && value > 0);
  return valid.length ? Math.max(...valid) + 1 : 1;
}

export function isPositiveFollowupNumber(value: number) {
  return Number.isInteger(value) && value > 0;
}
