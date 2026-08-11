export type CalendarInterval = { start_at: string; end_at: string };
export const businessTimezone = 'Asia/Kolkata';

/** Converts an explicit BSmile wall-clock date/time to UTC; Asia/Kolkata is UTC+05:30. */
export function businessLocalToStored(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Choose a valid date and time.');
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59 || month < 1 || month > 12 || day < 1 || day > 31) throw new Error('Choose a valid date and time.');
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 330 * 60_000).toISOString();
}

export function storedToBusinessParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: businessTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export function formatBusinessDateTime(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: businessTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export const overlaps = (a: CalendarInterval, b: CalendarInterval) => new Date(a.start_at) < new Date(b.end_at) && new Date(a.end_at) > new Date(b.start_at);

export function businessDateTime(date: string, time: string, timezone = 'Asia/Kolkata') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Choose a valid date and time.');
  // Convert a wall-clock value in the company timezone to a UTC instant without
  // depending on the browser's timezone.
  const wall = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(wall);
  const value = (name: string) => parts.find(part => part.type === name)?.value || '00';
  const rendered = `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:00Z`;
  return new Date(wall.getTime() + (wall.getTime() - new Date(rendered).getTime())).toISOString();
}

export function validateInterval(start: string, end: string) {
  if (!start || !end || new Date(start) >= new Date(end)) throw new Error('End time must be after start time.');
}
