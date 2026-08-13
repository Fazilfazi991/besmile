'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { adminRepository } from '@/lib/admin-repository';
import { FinanceEmpty, FinanceStatus, inr } from '@/components/finance-ui';
import { downloadOfficialReport } from '@/lib/official-report-download';

const today = () => new Date().toISOString().slice(0, 10);

export default function PayrollDetail() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<any>();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [payment, setPayment] = useState<any>();
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = async () => {
    try {
      const [loadedRun, options] = await Promise.all([adminRepository.payrollRun(id), adminRepository.financeOptions()]);
      setRun(loadedRun); setAccounts(options.accounts);
    } catch (error: any) { setNotice(error.message || 'Could not load payroll run.'); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [id]);

  const entries = useMemo(() => run?.payroll_entries || [], [run]);
  const totals = useMemo(() => ({
    basic: entries.reduce((sum: number, entry: any) => sum + Number(entry.basic_salary), 0),
    allowances: entries.reduce((sum: number, entry: any) => sum + Number(entry.allowances), 0),
    deductions: entries.reduce((sum: number, entry: any) => sum + Number(entry.deductions), 0),
    net: entries.reduce((sum: number, entry: any) => sum + Number(entry.basic_salary) + Number(entry.allowances) - Number(entry.deductions), 0),
  }), [entries]);

  const approve = async () => {
    try {
      const profile = await currentProfile() as any;
      await adminRepository.updatePayrollRun(id, { status: 'approved', approved_by: profile.id });
      await Promise.all(entries.filter((entry: any) => entry.payment_status === 'draft').map((entry: any) => adminRepository.updatePayrollEntry(entry.id, { payment_status: 'approved' })));
      await load();
    } catch (error: any) { setNotice(error.message || 'Could not approve payroll.'); }
  };
  const pay = async () => {
    try {
      const profile = await currentProfile() as any;
      await adminRepository.payPayrollEntry(payment, { ...payment, payment_date: payment.payment_date || today() }, profile.id);
      setPayment(null); setNotice('Salary payment recorded in the ledger.'); await load();
    } catch (error: any) { setNotice(error.message || 'Could not record salary payment.'); }
  };
  const downloadPayroll = async () => {
    setPdfBusy(true); setNotice('');
    try {
      await downloadOfficialReport({ reportType: 'payroll', columns: payrollColumns(), rows: entries.map(payrollRow), period: `Period: ${run.period_start} - ${run.period_end}`, filters: [`Status: ${run.status}`], totals: [{ label: 'Basic', value: inr(totals.basic) }, { label: 'Allowances', value: inr(totals.allowances) }, { label: 'Deductions', value: inr(totals.deductions) }, { label: 'Net payroll', value: inr(totals.net) }], context: { payroll_run_id: id, period_start: run.period_start, period_end: run.period_end }, filenameSuffix: `${run.period_start}_${run.period_end}` });
    } catch (error: any) { setNotice(error.message || 'Could not generate payroll PDF.'); }
    finally { setPdfBusy(false); }
  };
  const downloadPayslip = async (entry: any) => {
    setPdfBusy(true); setNotice('');
    try {
      const net = Number(entry.basic_salary) + Number(entry.allowances) - Number(entry.deductions);
      await downloadOfficialReport({ reportType: 'payslip', columns: [{ key: 'component', label: 'Salary component', weight: 2 }, { key: 'amount', label: 'Amount', align: 'right' }], rows: [{ component: 'Basic salary', amount: inr(entry.basic_salary) }, { component: 'Allowances', amount: inr(entry.allowances) }, { component: 'Deductions', amount: inr(entry.deductions) }], period: `Pay period: ${run.period_start} - ${run.period_end}`, filters: [`Employee: ${entry.profile?.full_name || 'Employee'}`, `Employee code: ${entry.profile?.employee_code || '—'}`, `Payment status: ${entry.payment_status}`], totals: [{ label: 'Net salary', value: inr(net) }], context: { payroll_run_id: id, payroll_entry_id: entry.id }, filenameSuffix: `${entry.profile?.employee_code || 'employee'}_${run.period_start}` });
    } catch (error: any) { setNotice(error.message || 'Could not generate salary slip.'); }
    finally { setPdfBusy(false); }
  };

  if (!run) return <p className="p-6">Loading payroll…</p>;
  return <section className="space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Payroll {run.period_start}</h1><p className="text-sm text-slate-500">{entries.length} employees · <FinanceStatus value={run.status} /></p></div><div className="flex gap-2">{run.status === 'draft' && <button className="btn btn-primary" onClick={() => void approve()}>Approve payroll</button>}<button className="btn border" disabled={pdfBusy} onClick={() => void downloadPayroll()}>{pdfBusy ? 'Generating PDF...' : 'Download payroll PDF'}</button></div></div>
    {notice && <p className="rounded border border-teal-200 bg-teal-50 p-3 text-sm">{notice}</p>}
    <div className="grid gap-3 md:grid-cols-4">{[['Basic', totals.basic], ['Allowances', totals.allowances], ['Deductions', totals.deductions], ['Net payroll', totals.net]].map(([label, value]) => <div className="card p-4" key={String(label)}><span className="text-sm text-slate-500">{label}</span><b className="block text-xl">{inr(value as number)}</b></div>)}</div>
    <div className="card overflow-x-auto"><table className="min-w-[960px] w-full text-sm"><thead className="bg-slate-50"><tr>{['Employee', 'Basic', 'Allowances', 'Deductions', 'Net', 'Payment', 'Action'].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{entries.map((entry: any) => <tr className="border-t" key={entry.id}><td className="p-3"><b>{entry.profile?.full_name || 'Employee'}</b><br /><span className="text-slate-500">{entry.profile?.employee_code || '—'} · {entry.profile?.designation || '—'}</span></td><td className="p-3">{inr(entry.basic_salary)}</td><td className="p-3">{inr(entry.allowances)}</td><td className="p-3">{inr(entry.deductions)}</td><td className="p-3 font-bold">{inr(Number(entry.basic_salary) + Number(entry.allowances) - Number(entry.deductions))}</td><td className="p-3"><FinanceStatus value={entry.payment_status} />{entry.payment_date && <><br />{entry.payment_date}</>}</td><td className="p-3">{run.status === 'draft' ? <button className="text-teal-700 underline" onClick={() => { const allowances = prompt('Allowances', entry.allowances); const deductions = prompt('Deductions', entry.deductions); if (allowances !== null && deductions !== null) void adminRepository.updatePayrollEntry(entry.id, { allowances: Number(allowances), deductions: Number(deductions) }).then(load); }}>Edit</button> : entry.payment_status !== 'paid' ? <button className="text-teal-700 underline" onClick={() => setPayment({ ...entry, account_id: accounts[0]?.id || '', payment_date: today(), payment_method: 'bank_transfer', payment_reference: '' })}>Mark paid</button> : <button className="text-teal-700 underline" disabled={pdfBusy} onClick={() => void downloadPayslip(entry)}>Download payslip</button>}</td></tr>)}</tbody></table>{!entries.length && <FinanceEmpty>No employee entries in this payroll run.</FinanceEmpty>}</div>
    {payment && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="card w-full max-w-md p-5"><h2 className="text-lg font-bold">Pay {payment.profile?.full_name}</h2><p className="mt-1 text-sm text-slate-500">{inr(Number(payment.basic_salary) + Number(payment.allowances) - Number(payment.deductions))}</p><div className="mt-4 grid gap-3"><label>Account<select className="input mt-1" value={payment.account_id} onChange={event => setPayment({ ...payment, account_id: event.target.value })}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Payment date<input className="input mt-1" type="date" value={payment.payment_date} onChange={event => setPayment({ ...payment, payment_date: event.target.value })} /></label><label>Method<select className="input mt-1" value={payment.payment_method} onChange={event => setPayment({ ...payment, payment_method: event.target.value })}>{['cash', 'bank_transfer', 'upi', 'card'].map(method => <option key={method}>{method}</option>)}</select></label><label>Reference<input className="input mt-1" value={payment.payment_reference} onChange={event => setPayment({ ...payment, payment_reference: event.target.value })} /></label></div><div className="mt-5 flex gap-2"><button className="btn btn-primary" onClick={() => void pay()}>Record payment</button><button className="btn border" onClick={() => setPayment(null)}>Cancel</button></div></div></div>}
  </section>;
}

const payrollColumns = () => [{ key: 'employee', label: 'Employee', weight: 1.8 }, { key: 'basic', label: 'Basic', align: 'right' as const }, { key: 'allowances', label: 'Allowances', align: 'right' as const }, { key: 'deductions', label: 'Deductions', align: 'right' as const }, { key: 'net', label: 'Net', align: 'right' as const }, { key: 'payment', label: 'Payment' }];
const payrollRow = (entry: any) => ({ employee: `${entry.profile?.full_name || 'Employee'}\n${entry.profile?.employee_code || '—'}`, basic: inr(entry.basic_salary), allowances: inr(entry.allowances), deductions: inr(entry.deductions), net: inr(Number(entry.basic_salary) + Number(entry.allowances) - Number(entry.deductions)), payment: entry.payment_status });
