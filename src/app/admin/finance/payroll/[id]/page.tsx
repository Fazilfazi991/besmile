'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminRepository } from '@/lib/admin-repository';
import { FinanceEmpty, FinanceStatus, inr } from '@/components/finance-ui';
import { downloadPayrollDocument } from '@/lib/payroll-documents';

const today = () => new Date().toISOString().slice(0, 10);
const adjustmentTypes = [
  ['allowance', 'Allowance'], ['bonus', 'Bonus'], ['incentive', 'Incentive'],
  ['other_earning', 'Other earning'], ['deduction', 'Deduction'], ['other_deduction', 'Other deduction'],
];

export default function PayrollDetail() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<any>();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [notice, setNotice] = useState('');
  const [payment, setPayment] = useState<any>();
  const [adjustment, setAdjustment] = useState<any>();
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = async () => {
    try {
      const [loadedRun, options, manage] = await Promise.all([adminRepository.payrollRun(id), adminRepository.financeOptions(), adminRepository.hasPermission('payroll.manage')]);
      setRun(loadedRun); setAccounts(options.accounts); setCanManage(manage); setNotice('');
    } catch (error: any) { setNotice(error.message || 'Could not load payroll run.'); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [id]);

  const entries = useMemo(() => run?.payroll_entries || [], [run]);
  const shown = useMemo(() => entries.filter((entry: any) => `${entry.profile?.full_name} ${entry.profile?.employee_code}`.toLowerCase().includes(employeeFilter.toLowerCase())), [entries, employeeFilter]);
  const totals = useMemo(() => ({
    gross: entries.reduce((sum: number, entry: any) => sum + Number(entry.gross_earnings), 0),
    deductions: entries.reduce((sum: number, entry: any) => sum + Number(entry.deductions) + Number(entry.other_deductions), 0),
    net: entries.reduce((sum: number, entry: any) => sum + Number(entry.net_payable), 0),
    paid: entries.filter((entry: any) => entry.payment_status === 'paid').length,
  }), [entries]);

  const approve = async () => { try { await adminRepository.approvePayrollRun(id); await load(); } catch (error: any) { setNotice(error.message || 'Could not approve payroll.'); } };
  const pay = async () => { try { await adminRepository.payPayrollEntry(payment, { ...payment, payment_date: payment.payment_date || today() }, ''); setPayment(null); setNotice('Salary payment recorded atomically in the Finance ledger.'); await load(); } catch (error: any) { setNotice(error.message || 'Could not record salary payment.'); } };
  const saveAdjustment = async (event: FormEvent) => { event.preventDefault(); try { await adminRepository.addPayrollAdjustment(adjustment.id, adjustment); setAdjustment(null); setNotice('Adjustment added with actor, time, amount and reason.'); await load(); } catch (error: any) { setNotice(error.message || 'Could not add adjustment.'); } };
  const download = async (path: string) => { setPdfBusy(true); setNotice(''); try { await downloadPayrollDocument(path); } catch (error: any) { setNotice(error.message || 'Could not generate payroll document.'); } finally { setPdfBusy(false); } };

  if (!run) return <p className="p-6">Loading payroll…</p>;
  return <section className="mx-auto max-w-[1320px] space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><p className="eyebrow">Employee payroll</p><h1 className="text-2xl font-bold">Payroll {run.period_start}</h1><p className="text-sm text-slate-500">{entries.length} employees · <FinanceStatus value={run.status} /></p></div><div className="flex flex-wrap gap-2">{canManage && run.status === 'draft' && <button className="btn btn-primary" onClick={() => void approve()}>Approve payroll</button>}<button className="btn border" disabled={pdfBusy || run.status === 'draft'} onClick={() => void download(`/api/payroll/runs/${id}/report`)}>Download payroll PDF</button></div></div>
    {notice && <p className="rounded border border-teal-200 bg-teal-50 p-3 text-sm">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[['Employees', entries.length], ['Gross payroll', inr(totals.gross)], ['Deductions', inr(totals.deductions)], ['Net payroll', inr(totals.net)], ['Paid', `${totals.paid}/${entries.length}`]].map(([label, value]) => <div className="card p-4" key={String(label)}><span className="text-sm text-slate-500">{label}</span><b className="block text-xl">{value}</b></div>)}</div>
    <div className="card p-4"><label className="block max-w-md text-sm font-semibold">Employee filter<input className="input mt-1" placeholder="Name or employee code" value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)} /></label></div>
    <div className="space-y-3 md:hidden">{shown.map((entry: any) => <PayrollCard key={entry.id} entry={entry} canManage={canManage} run={run} pdfBusy={pdfBusy} accounts={accounts} setAdjustment={setAdjustment} setPayment={setPayment} download={download} />)}{!shown.length && <div className="card"><FinanceEmpty>No payroll records match.</FinanceEmpty></div>}</div>
    <div className="card hidden overflow-x-auto md:block"><table className="min-w-[1080px] w-full text-sm"><thead className="bg-slate-50"><tr>{['Employee', 'Gross', 'Deductions', 'Net payable', 'Payment', 'Paid date / reference', 'Actions'].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{shown.map((entry: any) => <tr className="border-t" key={entry.id}><td className="p-3"><b>{entry.profile?.full_name || 'Employee'}</b><br /><span className="text-slate-500">{entry.profile?.employee_code || '—'} · {entry.profile?.department?.name || entry.profile?.designation || '—'}</span></td><td className="p-3">{inr(entry.gross_earnings)}</td><td className="p-3">{inr(Number(entry.deductions) + Number(entry.other_deductions))}</td><td className="p-3 font-bold">{inr(entry.net_payable)}</td><td className="p-3"><FinanceStatus value={entry.payment_status} /></td><td className="p-3">{entry.payment_date || '—'}<br /><span className="text-slate-500">{entry.payment_reference || '—'}</span></td><td className="p-3"><PayrollActions entry={entry} canManage={canManage} run={run} pdfBusy={pdfBusy} accounts={accounts} setAdjustment={setAdjustment} setPayment={setPayment} download={download} /></td></tr>)}</tbody></table>{!shown.length && <FinanceEmpty>No payroll records match.</FinanceEmpty>}</div>
    {adjustment && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={saveAdjustment} className="card w-full max-w-md p-5"><h2 className="text-lg font-bold">Add tracked adjustment</h2><p className="text-sm text-slate-500">{adjustment.profile?.full_name}</p><div className="mt-4 grid gap-3"><label>Type<select className="input mt-1" value={adjustment.adjustment_type} onChange={event => setAdjustment({ ...adjustment, adjustment_type: event.target.value })}>{adjustmentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Amount<input required min="0.01" step="0.01" type="number" className="input mt-1" value={adjustment.amount} onChange={event => setAdjustment({ ...adjustment, amount: event.target.value })} /></label><label>Reason<textarea required minLength={3} maxLength={500} className="input mt-1" value={adjustment.reason} onChange={event => setAdjustment({ ...adjustment, reason: event.target.value })} /></label></div><div className="mt-5 flex gap-2"><button className="btn btn-primary">Add adjustment</button><button type="button" className="btn border" onClick={() => setAdjustment(null)}>Cancel</button></div></form></div>}
    {payment && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="card w-full max-w-md p-5"><h2 className="text-lg font-bold">Pay {payment.profile?.full_name}</h2><p className="mt-1 text-sm text-slate-500">Stored net payable: {inr(payment.net_payable)}</p><div className="mt-4 grid gap-3"><label>Account<select required className="input mt-1" value={payment.account_id} onChange={event => setPayment({ ...payment, account_id: event.target.value })}><option value="">Select account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Payment date<input required className="input mt-1" type="date" value={payment.payment_date} onChange={event => setPayment({ ...payment, payment_date: event.target.value })} /></label><label>Method<select className="input mt-1" value={payment.payment_method} onChange={event => setPayment({ ...payment, payment_method: event.target.value })}>{['cash', 'bank_transfer', 'upi', 'card'].map(method => <option key={method}>{method}</option>)}</select></label><label>Reference<input className="input mt-1" value={payment.payment_reference} onChange={event => setPayment({ ...payment, payment_reference: event.target.value })} /></label></div><div className="mt-5 flex gap-2"><button disabled={!payment.account_id} className="btn btn-primary" onClick={() => void pay()}>Record payment</button><button className="btn border" onClick={() => setPayment(null)}>Cancel</button></div></div></div>}
  </section>;
}

function PayrollActions({ entry, canManage, run, pdfBusy, accounts, setAdjustment, setPayment, download }: any) {
  return <div className="flex flex-wrap gap-3">{canManage && run.status === 'draft' && <button className="text-teal-700 underline" onClick={() => setAdjustment({ ...entry, adjustment_type: 'bonus', amount: '', reason: '' })}>Add adjustment</button>}{canManage && run.status === 'approved' && entry.payment_status === 'approved' && <button disabled={!accounts.length} className="text-teal-700 underline" onClick={() => setPayment({ ...entry, account_id: '', payment_date: today(), payment_method: 'bank_transfer', payment_reference: '' })}>Mark paid</button>}{entry.payment_status !== 'draft' && <button className="text-teal-700 underline" disabled={pdfBusy} onClick={() => void download(`/api/payroll/entries/${entry.id}/payslip`)}>Payslip</button>}</div>;
}
function PayrollCard(props: any) { const { entry } = props; return <article className="card p-4"><div className="flex justify-between gap-3"><div><b>{entry.profile?.full_name}</b><p className="text-xs text-slate-500">{entry.profile?.employee_code || '—'}</p></div><FinanceStatus value={entry.payment_status} /></div><dl className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-slate-500">Gross</dt><dd>{inr(entry.gross_earnings)}</dd></div><div><dt className="text-slate-500">Deductions</dt><dd>{inr(Number(entry.deductions) + Number(entry.other_deductions))}</dd></div><div><dt className="text-slate-500">Net</dt><dd className="font-bold">{inr(entry.net_payable)}</dd></div></dl><div className="mt-3"><PayrollActions {...props} /></div></article>; }
