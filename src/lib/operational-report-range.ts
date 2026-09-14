import { BUSINESS_TIME_ZONE, getBusinessDayBounds } from './business-time';

export type OperationalReportRange = { from: string; to: string };

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function operationalReportRangeError(range: OperationalReportRange) {
  if (!range.from && !range.to) return '';
  if (!range.from || !range.to) return 'Choose both a start date and an end date.';
  if (!dateKeyPattern.test(range.from) || !dateKeyPattern.test(range.to)) return 'Choose valid report dates.';
  if (range.from > range.to) return 'Start date must be on or before end date.';
  return '';
}

export function operationalReportTimestampBounds(range: OperationalReportRange) {
  const error = operationalReportRangeError(range);
  if (error) throw new Error(error);
  if (!range.from || !range.to) return null;
  const start = getBusinessDayBounds(new Date(`${range.from}T12:00:00+05:30`)).start;
  const end = getBusinessDayBounds(new Date(`${range.to}T12:00:00+05:30`)).end;
  return { fromInclusive: start.toISOString(), toExclusive: new Date(end.getTime() + 1).toISOString(), timeZone: BUSINESS_TIME_ZONE };
}

export function operationalReportRangeLabel(range: OperationalReportRange) {
  if (!range.from || !range.to) return 'All dates';
  const format = (key: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
  return range.from === range.to ? format(range.from) : `${format(range.from)} – ${format(range.to)}`;
}
