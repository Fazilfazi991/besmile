import type { OfficialReportInput } from './official-document-engine';

export type PsychologistPaymentStatement = {
  id: string;
  statement_number: string;
  psychologist_id: string;
  psychologist_name: string;
  period_start: string;
  period_end: string;
  statement_date: string;
  payment_status: 'payment_due' | 'paid';
  session_count: number;
  total_amount: number | string;
  currency: 'INR';
  paid_date_from: string | null;
  paid_date_to: string | null;
  payment_references: string[];
  version: number;
};

export type PsychologistPaymentStatementItem = {
  payable_id: string;
  line_number: number;
  session_date: string;
  session_reference: string;
  due_date: string | null;
  payable_amount: number | string;
  currency: 'INR';
  payable_status: 'payment_due' | 'scheduled' | 'on_hold' | 'paid';
  paid_at: string | null;
  payment_reference: string | null;
};

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
  : '—';

const money = (value: number | string) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
}).format(Number(value));

const safeFilenamePart = (value: string) => value.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Psychologist';

export function psychologistPaymentStatementFilename(statement: PsychologistPaymentStatement) {
  const paid = statement.payment_status === 'paid' ? '_Paid' : '';
  return `BSmile_Psychologist_Payment_Statement_${safeFilenamePart(statement.psychologist_name)}_${statement.period_start}_to_${statement.period_end}${paid}.pdf`;
}

export function psychologistPaymentStatementReport(
  statement: PsychologistPaymentStatement,
  items: PsychologistPaymentStatementItem[],
): OfficialReportInput {
  if (!items.length || items.length !== Number(statement.session_count)) throw new Error('Statement item snapshot is incomplete.');
  const snapshotTotal = items.reduce((sum, item) => sum + Number(item.payable_amount), 0);
  if (Math.abs(snapshotTotal - Number(statement.total_amount)) > 0.005) throw new Error('Statement total does not match its payable snapshots.');

  const filters = [
    `Statement: ${statement.statement_number} · Version ${statement.version}`,
    `Psychologist: ${statement.psychologist_name}`,
    `Statement date: ${date(statement.statement_date)}`,
    `Payment status: ${statement.payment_status === 'paid' ? 'PAID' : 'PAYMENT DUE'}`,
  ];
  if (statement.payment_status === 'paid') {
    filters.push(statement.paid_date_from === statement.paid_date_to
      ? `Paid date: ${date(statement.paid_date_from)}`
      : `Paid dates: ${date(statement.paid_date_from)} - ${date(statement.paid_date_to)}`);
    if (statement.payment_references.length) {
      const shown = statement.payment_references.slice(0, 3).map(reference => reference.slice(0, 40));
      filters.push(`Payment reference: ${shown.join(', ')}${statement.payment_references.length > shown.length ? ` (+${statement.payment_references.length - shown.length} more)` : ''}`);
    }
  }

  return {
    heading: 'PSYCHOLOGIST PAYMENT STATEMENT',
    filename: psychologistPaymentStatementFilename(statement),
    period: `Settlement period: ${date(statement.period_start)} - ${date(statement.period_end)}`,
    filters,
    columns: [
      { key: 'sessionDate', label: 'Session Date', weight: 1.2 },
      { key: 'reference', label: 'Reference', weight: 1.35 },
      { key: 'dueDate', label: 'Due Date', weight: 1.15 },
      { key: 'status', label: 'Status', weight: 1.05 },
      { key: 'amount', label: 'Amount', align: 'right', weight: 1.2 },
    ],
    rows: [...items].sort((a, b) => a.line_number - b.line_number).map((item) => ({
      sessionDate: date(item.session_date),
      reference: item.session_reference,
      dueDate: date(item.due_date),
      status: item.payable_status === 'paid' ? 'Paid' : item.payable_status.replaceAll('_', ' '),
      amount: money(item.payable_amount),
    })),
    totals: [
      { label: 'Sessions', value: String(statement.session_count) },
      { label: statement.payment_status === 'paid' ? 'Total Paid' : 'Total Payable', value: money(statement.total_amount) },
      { label: 'Status', value: statement.payment_status === 'paid' ? 'PAID' : 'PAYMENT DUE' },
    ],
  };
}
