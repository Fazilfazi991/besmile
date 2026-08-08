/** BSmile's canonical business timezone (Kerala, India). */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

export function businessDateKey(value = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
