'use client';

import { useEffect, useMemo, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { FinanceEmpty, FinanceStatus, inr } from '@/components/finance-ui';
import { downloadPayrollDocument } from '@/lib/payroll-documents';

const periodLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));

export default function MyPayrollPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [downloading, setDownloading] = useState('');
  useEffect(() => { const timer = setTimeout(() => void (async () => { try { const profile = await currentProfile() as any; if (!profile) throw new Error('Your session has expired.'); setRows(await employeeRepository.myPayroll(profile.id)); } catch (caught: any) { setError(caught.message || 'Your salary history could not be loaded.'); } finally { setLoading(false); } })(), 0); return () => clearTimeout(timer); }, []);
  const shown = useMemo(() => rows.filter(row => !status || row.payment_status === status), [rows, status]);
  const latest = rows[0];
  const download = async (id: string) => { setDownloading(id); setError(''); try { await downloadPayrollDocument(`/api/payroll/entries/${id}/payslip`); } catch (caught: any) { setError(caught.message || 'Payslip could not be downloaded.'); } finally { setDownloading(''); } };
  return <section className="mx-auto max-w-[1120px] space-y-5">
    <div><p className="eyebrow">Employee self-service</p><h1 className="text-2xl font-bold">My salary history</h1><p className="mt-1 text-sm text-slate-600">Only your finalized payroll records are shown here.</p></div>
    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="card p-4"><p className="text-sm text-slate-500">Payroll records</p><b className="text-xl">{rows.length}</b></div><div className="card p-4"><p className="text-sm text-slate-500">Latest net salary</p><b className="text-xl">{latest ? inr(latest.net_payable) : '—'}</b></div><div className="card p-4"><p className="text-sm text-slate-500">Latest status</p><div className="mt-1">{latest ? <FinanceStatus value={latest.payment_status} /> : '—'}</div></div></div>
    <div className="card p-4"><label className="block max-w-xs text-sm font-semibold">Payment status<select className="input mt-1" value={status} onChange={event => setStatus(event.target.value)}><option value="">All finalized</option><option value="approved">Pending payment</option><option value="paid">Paid</option></select></label></div>
    <div className="space-y-3 md:hidden">{shown.map(row => <article className="card p-4" key={row.id}><div className="flex items-start justify-between gap-3"><div><b>{periodLabel(row.payroll_run.period_start)}</b><p className="text-xs text-slate-500">{row.payroll_run.period_start} – {row.payroll_run.period_end}</p></div><FinanceStatus value={row.payment_status} /></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Net salary</dt><dd className="font-bold">{inr(row.net_payable)}</dd></div><div><dt className="text-slate-500">Paid date</dt><dd>{row.payment_date || 'Pending'}</dd></div></dl><button className="btn border mt-4 w-full" disabled={downloading === row.id} onClick={() => void download(row.id)}>{downloading === row.id ? 'Preparing…' : 'Download my payslip'}</button></article>)}</div>
    <div className="card hidden overflow-x-auto md:block"><table className="min-w-[760px] w-full text-sm"><thead className="bg-slate-50"><tr>{['Payroll period', 'Gross', 'Deductions', 'Net salary', 'Status', 'Paid date', 'Payslip'].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{shown.map(row => <tr className="border-t" key={row.id}><td className="p-3"><b>{periodLabel(row.payroll_run.period_start)}</b><br /><span className="text-slate-500">{row.payroll_run.period_start} – {row.payroll_run.period_end}</span></td><td className="p-3">{inr(row.gross_earnings)}</td><td className="p-3">{inr(Number(row.deductions) + Number(row.other_deductions))}</td><td className="p-3 font-bold">{inr(row.net_payable)}</td><td className="p-3"><FinanceStatus value={row.payment_status} /></td><td className="p-3">{row.payment_date || 'Pending'}</td><td className="p-3"><button className="text-teal-700 underline" disabled={downloading === row.id} onClick={() => void download(row.id)}>Download</button></td></tr>)}</tbody></table></div>
    {!loading && !shown.length && <div className="card"><FinanceEmpty>No finalized payroll records match this filter.</FinanceEmpty></div>}{loading && <div className="card p-6 text-slate-500">Loading your salary history…</div>}
  </section>;
}
