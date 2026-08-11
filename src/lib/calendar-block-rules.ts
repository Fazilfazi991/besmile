import { businessLocalToStored, storedToBusinessParts, validateInterval } from './calendar-meeting-rules';

export type BlockTimeFields = { date: string; startTime: string; endTime: string; allDay: boolean; title: string };
export type CalendarBlockPayload = { start_at: string; end_at: string; all_day: boolean; title: string | null };

const addBusinessDays = (date: string, amount: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

export function blockPayloadFromFields(fields: BlockTimeFields): CalendarBlockPayload {
  const title = fields.title.trim();
  if (title.length > 160) throw new Error('Reason must be 160 characters or fewer.');
  if (fields.allDay) return {
    start_at: businessLocalToStored(fields.date, '00:00'),
    end_at: businessLocalToStored(addBusinessDays(fields.date, 1), '00:00'),
    all_day: true,
    title: title || null,
  };
  const start_at = businessLocalToStored(fields.date, fields.startTime);
  const end_at = businessLocalToStored(fields.date, fields.endTime);
  validateInterval(start_at, end_at);
  return { start_at, end_at, all_day: false, title: title || null };
}

export function blockFieldsFromStored(block: { start_at: string; end_at: string; all_day?: boolean; title?: string | null }): BlockTimeFields {
  const start = storedToBusinessParts(block.start_at);
  const end = storedToBusinessParts(block.end_at);
  return { date: start.date, startTime: start.time, endTime: end.time, allDay: Boolean(block.all_day), title: block.title || '' };
}
