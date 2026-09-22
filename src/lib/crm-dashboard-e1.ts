import { businessDateParts } from './executive-dashboard';

export const CRM_BUSINESS_TIME_ZONE = 'Asia/Kolkata';

export type CrmDashboardPeriod = 'today' | 'week' | 'month' | 'custom';
export type CrmDateRange = { start: string; end: string };
export type CrmDailyPoint = { date: string; leads: number; converted: number };
export type CrmNamedCount = { name: string; count: number };

export type CrmDashboardSummary = {
  periodLeads: number;
  converted: number;
  contacted: number;
  assessment: number;
  daily: CrmDailyPoint[];
  statuses: CrmNamedCount[];
  sources: CrmNamedCount[];
  followups: { due: number; overdue: number; upcoming: number; completed: number };
  financeAllowed: boolean;
  revenue: number;
  expenses: number;
};

export function crmConversionRate(summary: Pick<CrmDashboardSummary, 'periodLeads' | 'converted'>) {
  return summary.periodLeads ? (summary.converted / summary.periodLeads) * 100 : 0;
}

export function formatCrmConversionRate(summary: Pick<CrmDashboardSummary, 'periodLeads' | 'converted'>) {
  return `${Math.round(crmConversionRate(summary))}%`;
}

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const responseError = 'CRM dashboard data could not be verified. Refresh and try again.';

function dateFromKey(key: string) {
  if (!dateKeyPattern.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

function keyFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftCrmDateKey(key: string, days: number) {
  const date = dateFromKey(key);
  if (!date) throw new Error('A valid business date is required.');
  date.setUTCDate(date.getUTCDate() + days);
  return keyFromDate(date);
}

export function currentCrmBusinessDate(date = new Date()) {
  return businessDateParts(date, CRM_BUSINESS_TIME_ZONE).key;
}

export function sameCrmDateRange(left: CrmDateRange, right: CrmDateRange) {
  return left.start === right.start && left.end === right.end;
}

export function crmDashboardPeriodRange(
  period: Exclude<CrmDashboardPeriod, 'custom'>,
  today = currentCrmBusinessDate(),
): CrmDateRange {
  const end = dateFromKey(today);
  if (!end) throw new Error('A valid business date is required.');
  const start = new Date(end);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (period === 'month') start.setUTCDate(1);
  return { start: keyFromDate(start), end: today };
}

export function lastThirtyCrmDateRange(today = currentCrmBusinessDate()): CrmDateRange {
  return { start: shiftCrmDateKey(today, -29), end: today };
}

export function validateCustomCrmRange(range: CrmDateRange, today = currentCrmBusinessDate()) {
  if (!range.start || !range.end) return 'Choose both a start date and an end date.';
  if (!dateFromKey(range.start) || !dateFromKey(range.end)) return 'Choose valid calendar dates.';
  if (range.start > range.end) return 'Start date must be on or before the end date.';
  if (range.start > today || range.end > today) return 'Custom ranges cannot include future dates.';
  return '';
}

export function formatCrmRangeLabel(range: CrmDateRange) {
  const format = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const start = dateFromKey(range.start);
  const end = dateFromKey(range.end);
  if (!start || !end) return 'Invalid date range';
  return `${format.format(start)} – ${format.format(end)} · inclusive`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function count(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(responseError);
  return number;
}

function amount(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(responseError);
  return number;
}

function namedCounts(value: unknown) {
  if (!Array.isArray(value)) throw new Error(responseError);
  return value.map((item): CrmNamedCount => {
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) throw new Error(responseError);
    return { name: item.name.trim(), count: count(item.count) };
  });
}

export function normalizeCrmDashboardSummary(value: unknown, range: CrmDateRange): CrmDashboardSummary {
  if (!isRecord(value) || !dateFromKey(range.start) || !dateFromKey(range.end) || range.start > range.end) {
    throw new Error(responseError);
  }
  if (!Array.isArray(value.daily) || !isRecord(value.followups) || typeof value.financeAllowed !== 'boolean') {
    throw new Error(responseError);
  }
  const seen = new Set<string>();
  const daily = value.daily.map((item): CrmDailyPoint => {
    if (!isRecord(item) || typeof item.date !== 'string') throw new Error(responseError);
    const date = item.date.slice(0, 10);
    if (!dateFromKey(date) || date < range.start || date > range.end || seen.has(date)) throw new Error(responseError);
    seen.add(date);
    return { date, leads: count(item.leads), converted: count(item.converted) };
  }).sort((left, right) => left.date.localeCompare(right.date));
  const summary: CrmDashboardSummary = {
    periodLeads: count(value.periodLeads),
    converted: count(value.converted),
    contacted: count(value.contacted),
    assessment: count(value.assessment),
    daily,
    statuses: namedCounts(value.statuses),
    sources: namedCounts(value.sources),
    followups: {
      due: count(value.followups.due),
      overdue: count(value.followups.overdue),
      upcoming: count(value.followups.upcoming),
      completed: count(value.followups.completed),
    },
    financeAllowed: value.financeAllowed,
    revenue: amount(value.revenue),
    expenses: amount(value.expenses),
  };
  if (
    daily.reduce((total, point) => total + point.leads, 0) !== summary.periodLeads ||
    daily.reduce((total, point) => total + point.converted, 0) !== summary.converted ||
    summary.statuses.reduce((total, row) => total + row.count, 0) !== summary.periodLeads ||
    summary.sources.reduce((total, row) => total + row.count, 0) !== summary.periodLeads
  ) throw new Error(responseError);
  return summary;
}

export function thirtyDayLeadSeries(summary: CrmDashboardSummary, range: CrmDateRange) {
  const keys = Array.from({ length: 30 }, (_, index) => shiftCrmDateKey(range.start, index));
  if (keys.at(-1) !== range.end) throw new Error(responseError);
  const returned = new Map(summary.daily.map(point => [point.date, point]));
  const points = keys.map(date => returned.get(date) || { date, leads: 0, converted: 0 });
  if (points.reduce((total, point) => total + point.leads, 0) !== summary.periodLeads) throw new Error(responseError);
  return points;
}
