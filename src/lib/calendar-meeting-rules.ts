export type CalendarInterval = { start_at: string; end_at: string };

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
