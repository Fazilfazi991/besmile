'use client';
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { inr, FinanceStatus } from '@/components/finance-ui';
import { grantedPermissions } from '@/lib/granted-permissions';

const db: any = supabase;
const today = () => new Date().toISOString().slice(0, 10);
const paymentGroup = (status: string) => status === 'paid' ? 'paid' : 'pending';

type StatementHistory = {
  id: string;
  statement_number: string;
  psychologist_name: string;
  period_start: string;
  period_end: string;
  payment_status: 'payment_due' | 'paid';
  session_count: number;
  total_amount: number | string;
  version: number;
  generated_at: string;
};

export function PsychologistSessionPayables() {
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [history, setHistory] = useState<StatementHistory[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [canGenerate, setCanGenerate] = useState(false);
  const [status, setStatus] = useState('pending');
  const [doctor, setDoctor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadHistory = async () => {
    const response = await fetch('/api/finance/psychologist-payment-statements', { cache: 'no-store' });
    if (response.ok) setHistory((await response.json()).history || []);
  };
  const load = async () => {
    if (!db) return;
    try {
      const permissions = await grantedPermissions(db, [
        'psychologist_payments.view', 'psychologist_payments.manage', 'psychologist_payments.settle',
        'finance.manage', 'documents.manage', 'documents.employee.manage',
      ]);
      const mayView = permissions.has('psychologist_payments.view');
      const mayGenerate = permissions.has('psychologist_payments.manage')
        && (permissions.has('documents.manage') || permissions.has('documents.employee.manage'));
      setAllowed(mayView);
      setCanGenerate(mayGenerate);
      if (!mayView) return;
      const [payables, accountRows] = await Promise.all([
        db.from('psychologist_session_payables')
          .select('*,psychologist:outsourced_doctors(doctor_name),appointment:doctor_appointments(start_at)')
          .order('session_date', { ascending: false }),
        db.from('finance_accounts').select('id,name').eq('is_active', true).order('name'),
      ]);
      if (payables.error) throw payables.error;
      setRows(payables.data || []);
      setAccounts(accountRows.data || []);
      if (mayGenerate) await loadHistory();
    } catch (caught: any) {
      setError(caught.message || 'Unable to load psychologist payables.');
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { setSelected([]); }, [status, doctor, dateFrom, dateTo]);

  const doctors = useMemo(() => Array.from(new Map(rows.map(row => [row.psychologist_id, row.psychologist?.doctor_name || 'Psychologist'])).entries()), [rows]);
  const filteredRows = useMemo(() => rows.filter(row => {
    if (doctor && row.psychologist_id !== doctor) return false;
    if (status === 'pending' && !['payment_due', 'scheduled', 'on_hold'].includes(row.status)) return false;
    if (status !== 'pending' && status !== 'all' && row.status !== status) return false;
    if (dateFrom && row.session_date < dateFrom) return false;
    if (dateTo && row.session_date > dateTo) return false;
    return true;
  }), [rows, doctor, status, dateFrom, dateTo]);
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const selectedTotal = selectedRows.reduce((sum, row) => sum + Number(row.payable_amount), 0);
  const selectedGroup = selectedRows[0] ? paymentGroup(selectedRows[0].status) : '';
  const selectableRows = filteredRows.filter(row => row.status !== 'cancelled' && Boolean(doctor));
  const due = rows.filter(row => row.status === 'payment_due');
  const overdue = due.filter(row => row.due_date && row.due_date < today());
  const paid = rows.filter(row => row.status === 'paid');
  const pending = due.reduce((sum, row) => sum + Number(row.payable_amount), 0);

  const toggle = (row: any) => {
    setSelected(current => current.includes(row.id)
      ? current.filter(id => id !== row.id)
      : [...current, row.id]);
  };
  const canSelect = (row: any) => row.status !== 'cancelled'
    && Boolean(doctor)
    && (!selectedRows.length || (row.psychologist_id === selectedRows[0].psychologist_id && paymentGroup(row.status) === selectedGroup));
  const selectAll = () => {
    const group = status === 'paid' ? 'paid' : status === 'pending' ? 'pending' : '';
    if (!doctor || !group) return setError('Choose one psychologist and Pending or Paid status before selecting all.');
    setError('');
    setSelected(selectableRows.filter(row => paymentGroup(row.status) === group).map(row => row.id));
  };

  const downloadResponse = async (response: Response, fallback: string) => {
    const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(payload?.error || 'Unable to download the statement.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = decodeURIComponent(response.headers.get('X-Document-Filename') || fallback);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const generate = async (sourceStatementId?: string) => {
    if (!sourceStatementId && !selected.length) return setError('Select at least one eligible payable.');
    setBusy(sourceStatementId ? `regenerate:${sourceStatementId}` : 'generate'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/finance/psychologist-payment-statements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceStatementId ? { sourceStatementId } : { payableIds: selected }),
      });
      await downloadResponse(response, 'BSmile_Psychologist_Payment_Statement.pdf');
      setNotice(sourceStatementId ? 'A new audited statement version was generated.' : 'Official payment statement generated and stored privately.');
      setSelected([]);
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate the statement.');
    } finally { setBusy(''); }
  };
  const download = async (statement: StatementHistory) => {
    setBusy(`download:${statement.id}`); setError('');
    try {
      await downloadResponse(await fetch(`/api/finance/psychologist-payment-statements/${statement.id}/download`, { cache: 'no-store' }), `${statement.statement_number}.pdf`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to download the statement.'); }
    finally { setBusy(''); }
  };
  const settle = async (id: string) => {
    const account = accounts[0]?.id;
    if (!account) return setError('No active finance account is available.');
    setBusy(id); setError('');
    try {
      const { error: settlementError } = await db.rpc('settle_psychologist_session_payable', {
        target_payable: id, target_account: account, paid_on: today(), method: 'bank_transfer', reference: null,
      });
      if (settlementError) throw settlementError;
      await load();
    } catch (caught: any) { setError(caught.message || 'Unable to settle payable.'); }
    finally { setBusy(''); }
  };

  if (!allowed) return <section><h1 className="text-2xl font-bold">Psychologist payments</h1><p className="mt-3 text-rose-700">You do not have permission to view psychologist payment liabilities.</p></section>;
  return <section className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Psychologist session payments</h1><p className="text-slate-500">Eligible online-session liabilities only. Clinical notes are not shown here.</p></div></div>
    {error && <p className="rounded bg-rose-50 p-3 text-rose-700">{error}</p>}
    {notice && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Pending" value={inr(pending)}/><Metric label="Due soon" value={due.length - overdue.length}/><Metric label="Overdue" value={overdue.length}/><Metric label="Paid" value={paid.length}/></div>
    <div className="card space-y-3 p-4">
      <div><h2 className="font-semibold">Payment statement selection</h2><p className="text-sm text-slate-500">Choose one psychologist and a payment state. Official totals come from the selected payable snapshots.</p></div>
      <div className="flex flex-wrap gap-2">
        <select className="input" aria-label="Payment status" value={status} onChange={event => setStatus(event.target.value)}><option value="pending">Pending eligible</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option><option value="all">All statuses</option></select>
        <select className="input" aria-label="Psychologist" value={doctor} onChange={event => setDoctor(event.target.value)}><option value="">Select psychologist</option>{doctors.map(([id, name]) => <option key={String(id)} value={String(id)}>{String(name)}</option>)}</select>
        <label className="text-xs text-slate-500">From<input className="input block" aria-label="Session date from" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)}/></label>
        <label className="text-xs text-slate-500">To<input className="input block" aria-label="Session date to" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)}/></label>
      </div>
      {canGenerate && <div className="flex flex-wrap items-center gap-3"><button className="btn border" onClick={selectAll}>Select all eligible</button><button className="btn border" onClick={() => setSelected([])}>Clear</button><span className="text-sm">{selected.length} selected · <b>{inr(selectedTotal)}</b></span><button className="btn btn-primary" disabled={!selected.length || busy === 'generate'} onClick={() => void generate()}>{busy === 'generate' ? 'Generating…' : 'Generate Payment Statement'}</button></div>}
    </div>
    <div className="card overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead><tr className="border-b">{canGenerate && <th className="p-3 text-left">Select</th>}<th className="p-3 text-left">Psychologist</th><th className="p-3 text-left">Session</th><th className="p-3 text-left">Submitted</th><th className="p-3 text-right">Payable</th><th className="p-3 text-left">Due</th><th className="p-3 text-left">Status</th><th className="p-3"/></tr></thead><tbody>{filteredRows.map(row => { const isOverdue = row.status === 'payment_due' && row.due_date < today(); return <tr className="border-b" key={row.id}>{canGenerate && <td className="p-3"><input aria-label={`Select payable ${row.id}`} type="checkbox" checked={selected.includes(row.id)} disabled={!canSelect(row)} onChange={() => toggle(row)}/></td>}<td className="p-3">{row.psychologist?.doctor_name}</td><td className="p-3">{row.session_date}</td><td className="p-3">{String(row.session_record_submitted_at).slice(0, 10)}</td><td className="p-3 text-right">{inr(row.payable_amount)}</td><td className="p-3">{row.due_date || 'Manual'}</td><td className="p-3"><FinanceStatus value={isOverdue ? 'overdue' : row.status}/></td><td className="p-3">{row.status === 'payment_due' && <button className="btn border" disabled={busy === row.id} onClick={() => void settle(row.id)}>{busy === row.id ? 'Settling…' : 'Mark paid'}</button>}</td></tr>; })}</tbody></table>{!filteredRows.length && <p className="p-6 text-slate-500">No psychologist session payables match these filters.</p>}</div>
    {canGenerate && <div className="card overflow-x-auto"><div className="p-4"><h2 className="font-semibold">Statement history</h2><p className="text-sm text-slate-500">Every generated and regenerated version remains a separate official record.</p></div><table className="min-w-[780px] w-full text-sm"><thead><tr className="border-t border-b"><th className="p-3 text-left">Statement</th><th className="p-3 text-left">Psychologist</th><th className="p-3 text-left">Period</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Total</th><th className="p-3 text-left">Generated</th><th className="p-3"/></tr></thead><tbody>{history.map(item => <tr className="border-b" key={item.id}><td className="p-3"><b>{item.statement_number}</b><br/><span className="text-slate-500">Version {item.version} · {item.session_count} sessions</span></td><td className="p-3">{item.psychologist_name}</td><td className="p-3">{item.period_start} - {item.period_end}</td><td className="p-3"><FinanceStatus value={item.payment_status}/></td><td className="p-3 text-right">{inr(item.total_amount)}</td><td className="p-3">{new Date(item.generated_at).toLocaleString()}</td><td className="p-3"><div className="flex gap-2"><button className="btn border" disabled={Boolean(busy)} onClick={() => void download(item)}>Download</button><button className="btn border" disabled={Boolean(busy)} onClick={() => void generate(item.id)}>{busy === `regenerate:${item.id}` ? 'Regenerating…' : 'Regenerate'}</button></div></td></tr>)}</tbody></table>{!history.length && <p className="p-6 text-slate-500">No payment statements generated yet.</p>}</div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="card p-4"><p className="text-sm text-slate-500">{label}</p><b className="text-xl">{value}</b></article>;
}
