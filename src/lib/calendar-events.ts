export type AwarenessEvent = { name: string; recurrence_rule: string; notes?: string | null; is_active?: boolean };
export type CalendarEvent = { name: string; category: 'holiday' | 'awareness'; date: string; notes?: string | null };

const key = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const nthWeekday = (year: number, month: number, weekday: number, occurrence: number) => {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (occurrence - 1) * 7;
};

export function awarenessEventsForMonth(events: AwarenessEvent[], year: number, month: number) {
  const days = new Map<string, CalendarEvent[]>();
  const periods: AwarenessEvent[] = [];
  const add = (day: number, event: AwarenessEvent) => {
    const date = key(year, month, day);
    days.set(date, [...(days.get(date) || []), { name: event.name, category: 'awareness', date, notes: event.notes }]);
  };
  for (const event of events.filter(event => event.is_active !== false)) {
    const rule = event.recurrence_rule || '';
    const annual = /^annual_date:(\d{2})-(\d{2})$/.exec(rule);
    if (annual && Number(annual[1]) === month) { add(Number(annual[2]), event); continue; }
    const nth = /^(first|second|third)_(sunday|wednesday):(\d{2})$/.exec(rule);
    if (nth && Number(nth[3]) === month) {
      const occurrence = ({ first: 1, second: 2, third: 3 } as Record<string, number>)[nth[1]];
      const weekday = nth[2] === 'sunday' ? 0 : 3;
      add(nthWeekday(year, month, weekday, occurrence), event);
      continue;
    }
    if (rule === `annual_month:${String(month).padStart(2, '0')}` || rule === `configurable_period:${String(month).padStart(2, '0')}`) periods.push(event);
  }
  return { days, periods };
}
