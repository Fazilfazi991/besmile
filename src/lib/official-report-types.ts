import type { OfficialReportColumn, OfficialReportInput } from './official-document-engine';

export const officialReportSpecs = {
  leads: { heading: 'LEADS REPORT', permissions: ['crm.manage_all', 'crm.view_team', 'leads.view'] },
  patients: { heading: 'CLIENTS REPORT', permissions: ['patients.view', 'patients.view_all'] },
  employees: { heading: 'EMPLOYEE REPORT', permissions: ['employees.view'] },
  attendance: { heading: 'ATTENDANCE REPORT', permissions: ['attendance.view', 'attendance.manage'] },
  leave: { heading: 'LEAVE REPORT', permissions: ['leave.view', 'leave.manage', 'leave.approve'] },
  appointments: { heading: 'APPOINTMENTS REPORT', permissions: ['doctor_scheduling.view', 'appointments.view'] },
  documents: { heading: 'DOCUMENTS REPORT', permissions: ['documents.manage', 'documents.employee.manage', 'patient_documents.view'] },
  finance: { heading: 'FINANCE REPORT', permissions: ['reports.view', 'reports.finance.view', 'finance.view'] },
  finance_all: { heading: 'PROFIT & LOSS REPORT', permissions: ['reports.finance.view', 'reports.view'] },
  finance_income: { heading: 'INCOME REPORT', permissions: ['reports.finance.view', 'reports.view'] },
  finance_expense: { heading: 'EXPENSE REPORT', permissions: ['reports.finance.view', 'reports.view'] },
  finance_ledger: { heading: 'ACCOUNT LEDGER', permissions: ['reports.finance.view', 'reports.view'] },
  finance_invoices: { heading: 'INVOICE PAYMENTS REPORT', permissions: ['reports.finance.view', 'reports.view'] },
  finance_payroll: { heading: 'SALARY PAYMENTS REPORT', permissions: ['reports.finance.view', 'reports.view'] },
  invoice: { heading: 'INVOICE', permissions: ['invoices.view', 'invoices.manage'] },
  payroll: { heading: 'PAYROLL REPORT', permissions: ['payroll.view', 'payroll.manage'] },
  payslip: { heading: 'SALARY SLIP', permissions: ['payroll.view', 'payroll.manage'] },
} as const;

export type OfficialReportType = keyof typeof officialReportSpecs;

const clean = (value: unknown, limit: number) => String(value ?? '').trim().slice(0, limit);

export function validateOfficialReportPayload(raw: any): OfficialReportInput & { reportType: OfficialReportType; context: Record<string, string> } {
  const reportType = clean(raw?.reportType, 40) as OfficialReportType;
  const spec = officialReportSpecs[reportType];
  if (!spec) throw new Error('Choose a valid report type.');
  if (!Array.isArray(raw?.columns) || !raw.columns.length || raw.columns.length > 10) throw new Error('Report columns are invalid.');
  if (!Array.isArray(raw?.rows) || raw.rows.length > 2500) throw new Error('Report rows are invalid.');
  const columns: OfficialReportColumn[] = raw.columns.map((column: any, index: number) => ({
    key: clean(column?.key || `column_${index}`, 60),
    label: clean(column?.label, 80),
    align: ['left', 'right', 'center'].includes(column?.align) ? column.align : 'left',
    weight: Number.isFinite(Number(column?.weight)) ? Math.max(0.5, Math.min(3, Number(column.weight))) : undefined,
  }));
  if (columns.some((column) => !column.key || !column.label)) throw new Error('Report columns are invalid.');
  const rows = raw.rows.map((row: any) => Object.fromEntries(columns.map((column) => [column.key, clean(row?.[column.key], 700)])));
  const filters = Array.isArray(raw?.filters) ? raw.filters.slice(0, 8).map((value: unknown) => clean(value, 160)).filter(Boolean) : [];
  const totals = Array.isArray(raw?.totals) ? raw.totals.slice(0, 12).map((item: any) => ({ label: clean(item?.label, 80), value: clean(item?.value, 100) })).filter((item: any) => item.label) : [];
  const context = Object.fromEntries(Object.entries(raw?.context || {}).slice(0, 12).map(([key, value]) => [clean(key, 60), clean(value, 160)]));
  const suffix = clean(raw?.filenameSuffix, 90).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return {
    reportType,
    heading: spec.heading,
    filename: `BSmile_${spec.heading.replace(/[^A-Z0-9]+/g, '_')}${suffix ? `_${suffix}` : ''}.pdf`,
    columns,
    rows,
    period: clean(raw?.period, 160),
    filters,
    totals,
    context,
  };
}

export async function canGenerateOfficialReport(db: any, reportType: OfficialReportType) {
  const checks = await Promise.all(officialReportSpecs[reportType].permissions.map((permission_code) => db.rpc('has_permission', { permission_code })));
  return checks.some((result) => result.data === true);
}
