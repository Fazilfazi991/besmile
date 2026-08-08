/** BSmile's canonical business timezone (Kerala, India). */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

export function businessDateKey(value = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const getBusinessDate = (value = new Date()) => businessDateKey(value, BUSINESS_TIME_ZONE);
export const isSameBusinessDay = (left: Date | string, right: Date | string) => businessDateKey(new Date(left), BUSINESS_TIME_ZONE) === businessDateKey(new Date(right), BUSINESS_TIME_ZONE);
export function getBusinessDayBounds(value = new Date()) {
  const day = getBusinessDate(value); const [year, month, date] = day.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, date - 1, 18, 30));
  return { day, start, end: new Date(start.getTime() + 86400000 - 1) };
}
