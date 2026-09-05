export const EXECUTIVE_DASHBOARD_ROLES = ['director'] as const;

export function executiveFirstName(name?: string | null) {
  const clean = String(name || '').trim().replace(/^(mr|mrs|ms|dr)\.?\s+/i, '');
  return clean ? clean.split(/\s+/)[0] : '';
}

export function usesExecutiveDashboard(role?: string | null) {
  return EXECUTIVE_DASHBOARD_ROLES.includes(
    String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_') as (typeof EXECUTIVE_DASHBOARD_ROLES)[number],
  );
}

export type ExecutivePeriod = 'month' | 'previous_month' | 'quarter' | 'year';

export function businessDateParts(date = new Date(), timeZone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), key: `${get('year')}-${get('month')}-${get('day')}` };
}

export function executivePeriodRange(period: ExecutivePeriod, date = new Date(), timeZone = 'Asia/Kolkata') {
  const now = businessDateParts(date, timeZone);
  let startYear = now.year;
  let startMonth = now.month;
  let endYear = now.year;
  let endMonth = now.month;
  if (period === 'previous_month') {
    startMonth -= 1;
    if (!startMonth) { startMonth = 12; startYear -= 1; }
    endYear = startYear; endMonth = startMonth;
  } else if (period === 'quarter') {
    startMonth -= 2;
    if (startMonth < 1) { startMonth += 12; startYear -= 1; }
  } else if (period === 'year') {
    startMonth = 1;
  }
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    start: `${startYear}-${pad(startMonth)}-01`,
    end: period === 'previous_month' ? `${endYear}-${pad(endMonth)}-${pad(lastDay)}` : now.key,
  };
}

export const isInRange = (value: unknown, range: { start: string; end: string }) => {
  const key = String(value || '').slice(0, 10);
  return Boolean(key && key >= range.start && key <= range.end);
};

export function invoiceBalance(invoice: any) {
  const subtotal = (invoice.finance_invoice_items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0);
  const paid = (invoice.finance_invoice_payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  return Math.max(0, subtotal + Number(invoice.tax || 0) - Number(invoice.discount || 0) - paid);
}

export function percentageChange(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function isActiveLead(lead: any) {
  if (lead.archived_at || lead.converted_at) return false;
  return !/^(closed|disqualified|converted)$/i.test(String(lead.status?.name || '').trim());
}
