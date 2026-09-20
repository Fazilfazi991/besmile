import { compactInr } from './finance-format';
import {
  businessDateParts,
  executivePeriodRange,
  invoiceBalance,
  isActiveLead,
  isInRange,
  percentageChange,
  type ExecutivePeriod,
} from './executive-dashboard';

const REVENUE_TYPES = new Set(['income', 'invoice_payment']);
const EXPENSE_TYPES = new Set(['expense', 'payroll_payment']);

export function buildDirectorMetrics(data: any, period: ExecutivePeriod, now = new Date()) {
  const range = executivePeriodRange(period, now, data.timezone);
  const previous = executivePeriodRange('previous_month', now, data.timezone);
  const transactions = data.finance?.monthly || [];
  const total = (types: Set<string>, target: { start: string; end: string }) => transactions.filter((row: any) => types.has(row.transaction_type) && isInRange(row.transaction_date, target)).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const revenue = total(REVENUE_TYPES, range);
  const collections = total(new Set(['invoice_payment']), range);
  const expenses = total(EXPENSE_TYPES, range);
  const previousRevenue = total(REVENUE_TYPES, previous);
  const previousCollections = total(new Set(['invoice_payment']), previous);
  const leads = data.leads || [];
  const periodLeads = leads.filter((lead: any) => isInRange(lead.lead_date || lead.created_at, range));
  const periodConverted = periodLeads.filter((lead: any) => lead.converted_at && isInRange(lead.converted_at, range));
  const previousLeads = leads.filter((lead: any) => isInRange(lead.lead_date || lead.created_at, previous));
  const previousConverted = previousLeads.filter((lead: any) => lead.converted_at && isInRange(lead.converted_at, previous));
  const conversion = periodLeads.length ? periodConverted.length / periodLeads.length * 100 : 0;
  const previousConversion = previousLeads.length ? previousConverted.length / previousLeads.length * 100 : null;
  const openInvoices = (data.invoices || []).map((invoice: any) => ({ ...invoice, balance: invoiceBalance(invoice) })).filter((invoice: any) => invoice.balance > 0 && !['paid', 'cancelled'].includes(invoice.status));
  const outstanding = openInvoices.reduce((sum: number, invoice: any) => sum + invoice.balance, 0);
  const pipelineMap = new Map<string, { count: number; sortOrder: number }>();
  periodLeads.forEach((lead: any) => { const stage = lead.status?.name || 'Unassigned'; const current = pipelineMap.get(stage); pipelineMap.set(stage, { count: (current?.count || 0) + 1, sortOrder: Number(lead.status?.sort_order ?? Number.MAX_SAFE_INTEGER) }); });
  const pipeline = [...pipelineMap].map(([stage, row]) => ({ name: stage, count: row.count, percent: periodLeads.length ? row.count / periodLeads.length * 100 : 0, sortOrder: row.sortOrder })).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const today = businessDateParts(now, data.timezone).key;
  const overdueInvoices = openInvoices.filter((invoice: any) => invoice.due_date && String(invoice.due_date).slice(0, 10) < today);
  const overdueBalance = overdueInvoices.reduce((sum: number, invoice: any) => sum + invoice.balance, 0);
  const activeLeadRows = leads.filter(isActiveLead);
  const activeLeadMap = new Map<string, number>();
  activeLeadRows.forEach((lead: any) => { const stage = lead.status?.name || 'Unassigned'; activeLeadMap.set(stage, (activeLeadMap.get(stage) || 0) + 1); });
  const activeLeadDistribution = [...activeLeadMap].map(([label, value], index) => ({ label, value, color: ['#14988c', '#4f86d9', '#8a68d6', '#dc729d', '#de9a35'][index % 5] }));
  const priorities = [
    overdueInvoices.length && { icon: 'Invoices', label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`, detail: `${compactInr(overdueBalance)} outstanding`, href: '/admin/finance/invoices', action: 'Review', tone: 'danger' },
    Number(data.summary?.followupsDue) > 0 && { icon: 'Follow-ups', label: `${data.summary.followupsDue} lead follow-up${data.summary.followupsDue === 1 ? '' : 's'} due`, detail: 'CRM follow-up required today', href: '/admin/crm/follow-ups', action: 'Follow up', tone: 'warning' },
    Number(data.summary?.overdueTasks) > 0 && { icon: 'Overdue tasks', label: `${data.summary.overdueTasks} overdue task${data.summary.overdueTasks === 1 ? '' : 's'}`, detail: 'Past the assigned due date', href: '/admin/tasks', action: 'Review', tone: 'info' },
    Number(data.summary?.pendingLeave) > 0 && { icon: 'Leave approvals', label: `${data.summary.pendingLeave} leave request${data.summary.pendingLeave === 1 ? '' : 's'} pending`, detail: 'Awaiting management decision', href: '/admin/leaves', action: 'Decide', tone: 'neutral' },
  ].filter(Boolean).slice(0, 4);
  return { revenue, collections, expenses, profit: revenue - expenses, margin: revenue ? (revenue - expenses) / revenue * 100 : null, revenueChange: period === 'month' ? percentageChange(revenue, previousRevenue) : null, collectionsChange: period === 'month' ? percentageChange(collections, previousCollections) : null, activeLeads: activeLeadRows.length, todayLeads: Number(data.summary?.todayLeads || 0), activeLeadDistribution, periodLeadCount: periodLeads.length, periodConvertedCount: periodConverted.length, conversion, conversionPointChange: period === 'month' && previousConversion !== null ? conversion - previousConversion : null, outstanding, overdueOutstanding: overdueBalance, openInvoiceCount: openInvoices.length, pipeline, priorities, trend: lastSixMonths(data.finance?.monthly || [], data.sales || [], data.timezone, now) };
}

function lastSixMonths(transactions: any[], sales: any[], timeZone: string, now = new Date()) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    const key = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(date).slice(0, 7);
    return { key, label: new Intl.DateTimeFormat('en', { month: 'short', timeZone }).format(date), revenue: transactions.filter(row => REVENUE_TYPES.has(row.transaction_type) && String(row.transaction_date).slice(0, 7) === key).reduce((sum, row) => sum + Number(row.amount || 0), 0), collections: transactions.filter(row => row.transaction_type === 'invoice_payment' && String(row.transaction_date).slice(0, 7) === key).reduce((sum, row) => sum + Number(row.amount || 0), 0), sales: sales.filter(row => String(row.closing_date).slice(0, 7) === key).length };
  });
}
