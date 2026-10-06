import { validateAvailabilityRanges } from './doctor-scheduling-rules';
export const CLINICIAN_AVAILABILITY_TIME_ZONE = 'Asia/Kolkata';
type Cell = { cell: string; value: string };
export type AvailabilitySource = { row: number; name: string; days: Cell[]; times: Cell[] };
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const reviewRows: Record<number, string> = {
  2: 'Point times only; no approved end times.',
  17: 'Overnight range ends at 01:00; day rollover requires approval.',
  38: 'Workshop reference H37 crosses the person boundary; provenance requires review.',
  73: 'Sunday Anytime has no approved time boundaries.',
  108: 'Overnight range ends at 03:00; day rollover requires approval.',
  116: 'Saturday time unspecified; source phone also requires review.',
  129: 'Anytime has no approved boundaries; login email missing.',
  146: 'Day column E146 conflicts with weekday times in F146.',
};
function days(text: string): number[] | null {
  const value = text.trim().toLowerCase().replace(/\bmon\b/g, 'monday');
  if (/^(all days|sunday\s*(?:-|to)\s*saturday)$/.test(value)) return [0, 1, 2, 3, 4, 5, 6];
  const range = value.match(/^([a-z]+)\s*(?:-|to)\s*([a-z]+)$/);
  if (range) { const start = dayNames.indexOf(range[1]), end = dayNames.indexOf(range[2]); return start >= 0 && end >= start ? Array.from({ length: end-start+1 }, (_, i) => start+i) : null; }
  const result = value.split(/\s*(?:,|&)\s*/).map(day => dayNames.indexOf(day));
  return result.every(day => day >= 0) ? [...new Set(result)] : null;
}
function clock(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2] || 0);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return `${String(hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
export function normalizeClinicianAvailability(source: AvailabilitySource, approval?: { overnightApproved: true; sourceRow: number }) {
  const provenance = [...source.days, ...source.times];
  const held = (reason: string) => ({ name: source.name, source_row: source.row, time_zone: CLINICIAN_AVAILABILITY_TIME_ZONE, provenance, status: 'NO CHANGE — REVIEW REQUIRED', reason, proposed_ranges: [] as { day_of_week: number; start_time: string; end_time: string }[] });
  if (source.row === 160) return held('Internal Aiswarya identity and availability must be preserved.');
  const overnightApproved = approval?.overnightApproved === true && approval.sourceRow === source.row;
  if (reviewRows[source.row] && !([17, 108].includes(source.row) && overnightApproved)) return held(reviewRows[source.row]);
  if (!source.days.length || !source.times.length) return held('Missing explicit day/time boundaries.');
  const ranges: { day_of_week: number; start_time: string; end_time: string }[] = [];
  for (const [index, time] of source.times.entries()) {
    const dayCell = source.days.length === 1 ? source.days[0] : source.days[index];
    const weekdays = dayCell && days(dayCell.value);
    if (!weekdays) return held('Unrecognized or unmatched day cells.');
    for (const window of time.value.split(',')) {
      const pair = window.split(/\s*-\s*/); const start = pair.length === 2 ? clock(pair[0]) : null, end = pair.length === 2 ? clock(pair[1]) : null;
      if (!start || !end || start === end) return held('Ambiguous or invalid time range.');
      if (end < start && !overnightApproved) return held('Overnight day rollover requires explicit source-row approval.');
      for (const day of weekdays) ranges.push({ day_of_week: day, start_time: start, end_time: end });
    }
  }
  if (source.days.length > 1 && source.days.length !== source.times.length) return held('Day/time row count differs.');
  if (validateAvailabilityRanges(ranges, 5)) return held('Invalid or overlapping source ranges, including next-day rollover.');
  return { name: source.name, source_row: source.row, time_zone: CLINICIAN_AVAILABILITY_TIME_ZONE, provenance, status: 'DRY RUN ONLY — MAPPING AND IMPORT APPROVAL REQUIRED', reason: 'Explicit source boundaries parsed; no database write.', proposed_ranges: ranges };
}
