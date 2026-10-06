import { minutesOfDay, validateAvailabilityRanges, type AvailabilityRange } from './doctor-scheduling-rules';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const DAY_PRESETS = [
  { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
  { label: 'Mon–Sat', days: [1, 2, 3, 4, 5, 6] },
  { label: 'Sun–Thu', days: [0, 1, 2, 3, 4] },
  { label: 'All days', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekends', days: [6, 0] },
];
export type AvailabilitySlot = Pick<AvailabilityRange, 'start_time' | 'end_time'>;
export type AvailabilityGroup = { days: number[]; slots: AvailabilitySlot[] };

// Retain seconds other than :00 so invalid legacy data is flagged, never truncated silently.
const normalizeTime = (time: string) => time.length === 8 && time.endsWith(':00') ? time.slice(0, 5) : time;
export function normalizeWeeklyRanges(ranges: AvailabilityRange[]): AvailabilityRange[] {
  const unique = new Map<string, AvailabilityRange>();
  for (const row of ranges) {
    const normalized = { day_of_week: row.day_of_week, start_time: normalizeTime(row.start_time), end_time: normalizeTime(row.end_time) };
    unique.set(JSON.stringify(normalized), normalized);
  }
  return [...unique.values()].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time));
}
export function expandAvailabilityGroups(groups: AvailabilityGroup[]): AvailabilityRange[] {
  return normalizeWeeklyRanges(groups.flatMap(group => group.days.flatMap(day_of_week => group.slots.map(slot => ({ day_of_week, ...slot })))));
}
export function validateAvailabilityGroups(groups: AvailabilityGroup[], duration: number): string | null {
  for (const [index, group] of groups.entries()) {
    if (!group.days.length) return `Select at least one day for group ${index + 1}.`;
    if (!group.slots.length) return `Add at least one time slot for group ${index + 1}, or remove the group.`;
  }
  return validateAvailabilityRanges(expandAvailabilityGroups(groups), duration);
}
// Group days only when their complete slot sets match. Round trips preserve every range.
export function groupWeeklyRanges(ranges: AvailabilityRange[]): AvailabilityGroup[] {
  const byDay = new Map<number, AvailabilitySlot[]>();
  for (const { day_of_week, start_time, end_time } of normalizeWeeklyRanges(ranges)) {
    byDay.set(day_of_week, [...(byDay.get(day_of_week) || []), { start_time, end_time }]);
  }
  const groups = new Map<string, AvailabilityGroup>();
  for (const day of DISPLAY_DAYS) {
    const slots = byDay.get(day);
    if (!slots) continue;
    const key = JSON.stringify(slots);
    const group = groups.get(key);
    if (group) group.days.push(day);
    else groups.set(key, { days: [day], slots });
  }
  // Invalid stored weekdays still need to be shown and rejected before save.
  for (const [day, slots] of byDay) if (!DISPLAY_DAYS.includes(day)) groups.set(`invalid-${day}`, { days: [day], slots });
  return [...groups.values()];
}
export function formatAvailabilityTime(time: string) {
  if (time === '24:00') return '12:00 AM (end of day)';
  const minute = minutesOfDay(time), hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

const aliases: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const dayIndex = (name: string) => Object.hasOwn(aliases, name) ? aliases[name] : undefined;
function parseDays(text: string): number[] {
  const value = text.trim().toLowerCase();
  if (/^(all days|every day)$/.test(value)) return [0, 1, 2, 3, 4, 5, 6];
  if (value === 'weekdays') return [1, 2, 3, 4, 5];
  if (value === 'weekends') return [6, 0];
  const result: number[] = [];
  for (const part of value.split(',')) {
    const pair = part.trim().match(/^([a-z]+)\s*(?:-|\bto\b)\s*([a-z]+)$/);
    if (pair) {
      const start = dayIndex(pair[1]), end = dayIndex(pair[2]);
      if (start === undefined || end === undefined || start === end) throw new Error('Correct the weekday range.');
      for (let day = start; ; day = (day + 1) % 7) { result.push(day); if (day === end) break; }
    } else {
      const day = dayIndex(part.trim());
      if (day === undefined) throw new Error('Correct the weekday names or day range.');
      result.push(day);
    }
  }
  if (new Set(result).size !== result.length) throw new Error('Conflicting or repeated weekdays. List each day once in a day group.');
  return result;
}
function parseClock(text: string, sharedMeridiem?: string, isEnd = false): string {
  const value = text.trim();
  const match = value.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/i);
  if (!match) throw new Error('Correct the time. Use 9:30 AM or 09:30.');
  let hour = Number(match[1]); const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase() || sharedMeridiem;
  if (minute > 59) throw new Error('Minutes must be between 00 and 59.');
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error('AM/PM hours must be between 1 and 12.');
    hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  } else if (!/^\d{2}:\d{2}$/.test(value) || hour > 23 && !(isEnd && hour === 24 && minute === 0)) {
    throw new Error('Add AM/PM to each time, or use 24-hour HH:MM format.');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function parseSlot(text: string): AvailabilitySlot {
  if (/\banytime\b/i.test(text)) throw new Error("'Anytime' needs a specific start and end time.");
  const pair = text.trim().split(/\s*(?:-|\bto\b)\s*/i);
  if (pair.length === 1) {
    // This produces the requested actionable message for valid point-time lists.
    parseClock(pair[0]);
    throw new Error('We found start times but no end times. Add an end time for each slot.');
  }
  if (pair.length !== 2 || !pair[0] || !pair[1]) throw new Error('Add a valid start and end time for each slot.');
  const firstMeridiem = pair[0].match(/(am|pm)$/i)?.[1].toLowerCase();
  const lastMeridiem = pair[1].match(/(am|pm)$/i)?.[1].toLowerCase();
  // Shorthand 9–10 AM applies AM to the bare hour. Explicit HH:MM stays 24-hour.
  const bare = (value: string) => /^\d{1,2}(?:[.:]\d{2})?$/.test(value.trim()) && !/^\d{2}:\d{2}$/.test(value.trim());
  const sharedStart = !firstMeridiem && bare(pair[0]) ? lastMeridiem : undefined;
  const sharedEnd = !lastMeridiem && bare(pair[1]) ? firstMeridiem : undefined;
  const start_time = parseClock(pair[0], sharedStart), end_time = parseClock(pair[1], sharedEnd, true);
  if ((sharedStart || sharedEnd) && end_time <= start_time) throw new Error('This AM/PM shorthand is ambiguous. Add AM/PM explicitly to both ends of the range.');
  return { start_time, end_time };
}
export type ParsedAvailability = { groups: AvailabilityGroup[]; ranges: AvailabilityRange[]; error: null } | { groups: []; ranges: []; error: string };
// Pure parsing only: no repository imports, network access, or persistence.
export function parseAvailabilityText(text: string, duration: number): ParsedAvailability {
  try {
    if (!text.trim()) throw new Error('Enter weekdays and time ranges to preview.');
    const lines: { text: string; number: number }[] = [];
    for (const [index, raw] of text.replace(/[–—→]/g, '-').split(/\r?\n/).entries()) {
      if (!raw.trim()) continue;
      // Allow a pasted line wrap only after an explicit comma.
      if (/^\s*\d/.test(raw) && lines.at(-1)?.text.trim().endsWith(',')) lines[lines.length - 1].text += ' ' + raw.trim();
      else lines.push({ text: raw.trim(), number: index + 1 });
    }
    const groups: AvailabilityGroup[] = [];
    for (const line of lines) {
      try {
        if (/\banytime\b/i.test(line.text)) throw new Error("'Anytime' needs a specific start and end time.");
        const match = line.text.match(/^([^\d]+?)\s*:?\s*(\d.*)$/);
        if (!match) throw new Error('Enter weekdays followed by start–end time ranges.');
        groups.push({ days: parseDays(match[1].replace(/:\s*$/, '')), slots: match[2].split(',').map(parseSlot) });
      } catch (error) { throw new Error(`Line ${line.number}: ${(error as Error).message}`); }
    }
    const error = validateAvailabilityGroups(groups, duration);
    if (error) throw new Error(error);
    const ranges = expandAvailabilityGroups(groups);
    return { groups: groupWeeklyRanges(ranges), ranges, error: null };
  } catch (error) { return { groups: [], ranges: [], error: (error as Error).message }; }
}
