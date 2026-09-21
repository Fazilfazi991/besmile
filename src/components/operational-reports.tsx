'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clientSafeError } from '@/lib/client-error';
import { documentExpiryLabel } from '@/lib/document-expiry-rules';
import { employeeStatuses, employeeStatusLabel } from '@/lib/employee-status';
import { grantedPermissions } from '@/lib/granted-permissions';
import { downloadOfficialReport } from '@/lib/official-report-download';
import {
  operationalReportRangeError,
  operationalReportRangeLabel,
  operationalReportTimestampBounds,
  type OperationalReportRange,
} from '@/lib/operational-report-range';
import { downloadReportCsv, downloadReportXlsx, type ReportRow } from '@/lib/report-export';
import { supabase } from '@/lib/supabase';

const db: any = supabase;
type Key = 'leads' | 'patients' | 'employees' | 'attendance' | 'leave' | 'appointments' | 'documents' | 'finance';
type ReportMeta = { label: string; permissions: string[]; headers: string[] };

const meta: Record<Key, ReportMeta> = {
  leads: { label: 'Leads', permissions: ['crm.manage_all', 'crm.view_team', 'leads.view'], headers: ['Created', 'Lead name', 'Phone', 'Source', 'Assigned staff', 'Status', 'Follow-up', 'Converted client ID'] },
  patients: { label: 'Clients', permissions: ['patients.view', 'patients.view_all'], headers: ['Client ID', 'Name', 'Phone', 'Email', 'Status', 'Source', 'Assigned psychologist', 'Created'] },
  employees: { label: 'Employees', permissions: ['employees.view'], headers: ['Employee code', 'Name', 'Department', 'Designation', 'Employment status', 'Joining date', 'Manager'] },
  attendance: { label: 'Attendance', permissions: ['attendance.view', 'attendance.manage'], headers: ['Date', 'Employee', 'Punch-In', 'Break minutes', 'Punch-Out', 'Status'] },
  leave: { label: 'Leave', permissions: ['leave.view', 'leave.manage', 'leave.approve'], headers: ['Employee', 'Leave type', 'Start', 'End', 'Days', 'Status', 'Requested'] },
  appointments: { label: 'Appointments', permissions: ['doctor_scheduling.view', 'appointments.view'], headers: ['Appointment', 'Client', 'Client ID', 'Clinician', 'Clinician type', 'Status', 'Created'] },
  documents: { label: 'Documents', permissions: ['documents.manage', 'documents.employee.manage', 'patient_documents.view'], headers: ['Owner type', 'Document type', 'Owner / entity', 'Expiry date', 'Status'] },
  finance: { label: 'Finance', permissions: ['reports.view', 'reports.finance.view', 'finance.view'], headers: ['Date', 'Type', 'Account', 'Category', 'Description', 'Amount'] },
};

const permissionCodes = [...new Set(Object.values(meta).flatMap(item => item.permissions))];
const emptyRange: OperationalReportRange = { from: '', to: '' };
const value = (input: unknown) => input === null || input === undefined || input === '' ? '—' : String(input);
const date = (input: unknown) => input ? String(input).slice(0, 10) : '';

function dateRange(query: any, column: string, range: OperationalReportRange) {
  if (!range.from || !range.to) return query;
  return query.gte(column, range.from).lte(column, range.to);
}

function timestampRange(query: any, column: string, range: OperationalReportRange) {
  const bounds = operationalReportTimestampBounds(range);
  if (!bounds) return query;
  return query.gte(column, bounds.fromInclusive).lt(column, bounds.toExclusive);
}

async function loadReportRows(kind: Key, range: OperationalReportRange, employeeStatus: string): Promise<ReportRow[]> {
  if (kind === 'leads') {
    let query = db.from('crm_leads').select('lead_date,full_name,phone,source:crm_lead_sources(name),assignee:profiles!crm_leads_assigned_to_fkey(full_name),status:crm_lead_statuses(name),converted_patient:patients!crm_leads_converted_patient_id_fkey(patient_number),crm_lead_followups(next_follow_up_at)').is('archived_at', null).order('lead_date', { ascending: false });
    query = dateRange(query, 'lead_date', range);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data || []).map((row: any) => ({ 'Created': date(row.lead_date), 'Lead name': row.full_name, 'Phone': row.phone, 'Source': value(row.source?.name), 'Assigned staff': value(row.assignee?.full_name), 'Status': value(row.status?.name), 'Follow-up': date(row.crm_lead_followups?.[0]?.next_follow_up_at), 'Converted client ID': value(row.converted_patient?.patient_number) }));
  }
  if (kind === 'patients') {
    let query = db.from('patients').select('patient_number,full_name,phone,email,status,source,created_at,assigned:profiles!patients_assigned_psychologist_id_fkey(full_name)').is('deleted_at', null).order('created_at', { ascending: false });
    query = timestampRange(query, 'created_at', range);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data || []).map((row: any) => ({ 'Client ID': row.patient_number, 'Name': row.full_name, 'Phone': value(row.phone), 'Email': value(row.email), 'Status': row.status, 'Source': value(row.source), 'Assigned psychologist': value(row.assigned?.full_name), 'Created': date(row.created_at) }));
  }
  if (kind === 'employees') {
    let query = db.from('profiles').select('employee_code,full_name,designation,status,joining_date,manager_id,department:departments(name)').eq('is_employee', true).eq('workforce_visible', true).neq('role', 'director').order('full_name');
    if (employeeStatus) query = query.eq('status', employeeStatus);
    query = dateRange(query, 'joining_date', range);
    const result = await query;
    if (result.error) throw result.error;
    const managerIds = [...new Set((result.data || []).map((row: any) => row.manager_id).filter(Boolean))];
    const managers = managerIds.length ? await db.from('profiles').select('id,full_name').in('id',managerIds) : { data: [], error: null };
    if (managers.error) throw managers.error;
    const managerNames = new Map((managers.data || []).map((manager: any) => [manager.id, manager.full_name]));
    return (result.data || []).map((row: any) => ({ 'Employee code': value(row.employee_code), 'Name': row.full_name, 'Department': value(row.department?.name), 'Designation': value(row.designation), 'Employment status': employeeStatusLabel(row.status), 'Joining date': date(row.joining_date), 'Manager': value(managerNames.get(row.manager_id)) }));
  }
  if (kind === 'attendance') {
    let query = db.from('attendance').select('work_date,clock_in,clock_out,break_minutes,status,employee:profiles!inner(full_name,role)').neq('employee.role', 'director').order('work_date', { ascending: false });
    query = dateRange(query, 'work_date', range);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data || []).map((row: any) => ({ 'Date': row.work_date, 'Employee': value(row.employee?.full_name), 'Punch-In': value(row.clock_in), 'Break minutes': row.break_minutes || 0, 'Punch-Out': value(row.clock_out), 'Status': row.status }));
  }
  if (kind === 'leave') {
    let query = db.from('leave_requests').select('leave_type,starts_on,ends_on,requested_days,status,created_at,leave_types(name),employee:profiles!leave_requests_profile_id_fkey(full_name)').order('starts_on', { ascending: false });
    query = dateRange(query, 'starts_on', range);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data || []).map((row: any) => ({ 'Employee': value(row.employee?.full_name), 'Leave type': value(row.leave_types?.name || row.leave_type), 'Start': row.starts_on, 'End': row.ends_on, 'Days': row.requested_days || '', 'Status': row.status, 'Requested': date(row.created_at) }));
  }
  if (kind === 'appointments') {
    let query = db.from('doctor_appointments').select('start_at,status,created_at,doctor:outsourced_doctors(doctor_name,clinician_type),patient:patients(full_name,patient_number)').is('deleted_at', null).order('start_at', { ascending: false });
    query = timestampRange(query, 'start_at', range);
    const result = await query;
    if (result.error) throw result.error;
    return (result.data || []).map((row: any) => ({ 'Appointment': row.start_at, 'Client': value(row.patient?.full_name), 'Client ID': value(row.patient?.patient_number), 'Clinician': value(row.doctor?.doctor_name), 'Clinician type': value(row.doctor?.clinician_type).replaceAll('_', ' '), 'Status': row.status, 'Created': date(row.created_at) }));
  }
  if (kind === 'documents') {
    let companyQuery = db.from('documents').select('title,category,expiry_date,archived_at').is('archived_at', null);
    let patientQuery = db.from('patient_documents').select('document_name,category,expiry_date,status,patient:patients(full_name)').is('deleted_at', null).neq('status', 'replaced');
    companyQuery = dateRange(companyQuery, 'expiry_date', range);
    patientQuery = dateRange(patientQuery, 'expiry_date', range);
    const [company, patient] = await Promise.all([companyQuery, patientQuery]);
    if (company.error) throw company.error;
    if (patient.error) throw patient.error;
    return [
      ...(company.data || []).map((row: any) => ({ 'Owner type': 'Operational', 'Document type': value(row.category), 'Owner / entity': row.title, 'Expiry date': date(row.expiry_date), 'Status': documentExpiryLabel(row.expiry_date) || 'Valid' })),
      ...(patient.data || []).map((row: any) => ({ 'Owner type': 'Client', 'Document type': row.category, 'Owner / entity': value(row.patient?.full_name), 'Expiry date': date(row.expiry_date), 'Status': row.status === 'archived' ? 'Archived' : documentExpiryLabel(row.expiry_date) || 'Valid' })),
    ];
  }
  let query = db.from('finance_transactions').select('transaction_date,transaction_type,amount,counterparty_name,description,account:finance_accounts(name),income_category:finance_income_categories(name),expense_category:finance_expense_categories(name)').is('archived_at', null).order('transaction_date', { ascending: false });
  query = dateRange(query, 'transaction_date', range);
  const result = await query;
  if (result.error) throw result.error;
  return (result.data || []).map((row: any) => ({ 'Date': row.transaction_date, 'Type': row.transaction_type, 'Account': value(row.account?.name), 'Category': value(row.income_category?.name || row.expense_category?.name), 'Description': value(row.counterparty_name || row.description), 'Amount': row.amount }));
}

export function OperationalReports() {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [kind, setKind] = useState<Key>('leads');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [draftRange, setDraftRange] = useState<OperationalReportRange>(emptyRange);
  const [appliedRange, setAppliedRange] = useState<OperationalReportRange>(emptyRange);
  const [rangeError, setRangeError] = useState('');
  const [employeeStatus, setEmployeeStatus] = useState('');
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!db) return;
    void grantedPermissions(db, permissionCodes).then(allowed => setPermissions(Object.fromEntries(permissionCodes.map(code => [code, allowed.has(code)]))));
  }, []);
  const available = useMemo(() => (Object.keys(meta) as Key[]).filter(key => meta[key].permissions.some(code => permissions[code])), [permissions]);
  const activeKind = available.includes(kind) ? kind : available[0] || kind;
  useEffect(() => {
    if (!db || !available.includes(activeKind)) return;
    let cancelled = false;
    const load = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError('');
      setRows([]);
      try {
        const data = await loadReportRows(activeKind, appliedRange, employeeStatus);
        if (!cancelled) setRows(data);
      } catch (cause) {
        if (!cancelled) setError(clientSafeError(cause, 'Report unavailable. Please try again.', { route: '/admin/reports', action: 'load' }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeKind, appliedRange, available, employeeStatus]);

  const headers = meta[activeKind].headers;
  const rangeLabel = operationalReportRangeLabel(appliedRange);
  const rangeSuffix = appliedRange.from && appliedRange.to ? `${appliedRange.from}_${appliedRange.to}` : 'all-dates';
  const file = `bsmile-${activeKind}-report-${rangeSuffix}`;
  const changeKind = (next: Key) => { setRows([]); setKind(next); setEmployeeStatus(''); };
  const applyRange = (event: FormEvent) => {
    event.preventDefault();
    const nextError = operationalReportRangeError(draftRange);
    setRangeError(nextError);
    if (nextError) return;
    setRows([]);
    setAppliedRange({ ...draftRange });
  };
  const clearRange = () => {
    setRangeError('');
    setRows([]);
    setDraftRange(emptyRange);
    setAppliedRange(emptyRange);
  };
  const pdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      await downloadOfficialReport({
        reportType: activeKind,
        columns: headers.map(header => ({ key: header, label: header, align: header === 'Amount' ? 'right' : 'left', weight: /Description|Name|Owner|Client|Lead/.test(header) ? 1.45 : 1 })),
        rows,
        period: `Period: ${rangeLabel}`,
        filters: activeKind === 'employees' && employeeStatus ? [`Employment status: ${employeeStatusLabel(employeeStatus)}`] : [],
        context: { from: appliedRange.from || 'all', to: appliedRange.to || 'all', employee_status: employeeStatus || 'all' },
        filenameSuffix: rangeSuffix,
      });
    } catch (cause: any) {
      setError(cause.message || 'Unable to generate PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  return <section className="operational-reports space-y-4">
    <header className="operational-reports-header">
      <div><h1>Operational reports</h1><p>Exports use the applied report and date range. Sensitive clinical content is excluded.</p></div>
      <div className="operational-report-exports no-print" aria-label="Report exports">
        <button className="btn border" disabled={loading} onClick={() => downloadReportCsv(`${file}.csv`, headers, rows)}>CSV</button>
        <button className="btn border" disabled={loading} onClick={() => void downloadReportXlsx(`${file}.xlsx`, headers, rows)}>Excel</button>
        <button className="btn border" disabled={loading || pdfBusy} onClick={() => void pdf()}>{pdfBusy ? 'Generating PDF…' : 'Download PDF'}</button>
      </div>
    </header>
    {error && <p className="operational-report-error" role="alert">{error}</p>}
    <form className="operational-report-filters card" onSubmit={applyRange}>
      <label>Report<select className="input" aria-label="Report" value={activeKind} onChange={event => changeKind(event.target.value as Key)}>{available.map(key => <option key={key} value={key}>{meta[key].label}</option>)}</select></label>
      {activeKind === 'employees' && <label>Employment status<select className="input" value={employeeStatus} onChange={event => { setRows([]); setEmployeeStatus(event.target.value); }}><option value="">All employment statuses</option>{employeeStatuses.map(status => <option value={status} key={status}>{employeeStatusLabel(status)}</option>)}</select></label>}
      <label>Start date<input aria-label="Start date" className="input" type="date" value={draftRange.from} onChange={event => { setRangeError(''); setDraftRange(current => ({ ...current, from: event.target.value })); }} /></label>
      <label>End date<input aria-label="End date" className="input" type="date" value={draftRange.to} onChange={event => { setRangeError(''); setDraftRange(current => ({ ...current, to: event.target.value })); }} /></label>
      <div className="operational-report-filter-actions"><button className="btn btn-primary" type="submit" disabled={loading}>Apply</button><button className="btn border" type="button" disabled={loading && !appliedRange.from} onClick={clearRange}>Clear</button></div>
      <p className="operational-report-range" data-testid="operational-report-range"><span>Applied range</span><b>{rangeLabel}</b><small>Asia/Kolkata business dates</small></p>
      {rangeError && <p className="operational-report-range-error" role="alert">{rangeError}</p>}
    </form>
    <section className="operational-report-results card" aria-busy={loading} aria-label={`${meta[activeKind].label} report`}>
      <div className="operational-report-table-wrap"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map(header => <td key={header}>{value(row[header])}</td>)}</tr>)}</tbody></table></div>
      <div className="operational-report-mobile">{rows.map((row, index) => <article key={index}>{headers.map(header => <div key={header}><dt>{header}</dt><dd>{value(row[header])}</dd></div>)}</article>)}</div>
      {loading ? <p className="operational-report-state">Loading {meta[activeKind].label.toLocaleLowerCase()} report…</p> : !rows.length && <p className="operational-report-state">No records match this report and applied range.</p>}
    </section>
  </section>;
}
