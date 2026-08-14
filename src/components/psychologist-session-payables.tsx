'use client';
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { inr, FinanceStatus } from '@/components/finance-ui';
import { grantedPermissions } from '@/lib/granted-permissions';

const db: any = supabase;
const today = () => new Date().toISOString().slice(0, 10);

export function PsychologistSessionPayables() {
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [doctor, setDoctor] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [settling, setSettling] = useState<any | null>(null);
  const [accountId, setAccountId] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('bank_transfer');

  const load = async () => {
    if (!db) return;
    setLoading(true);
    try {
      const permissions = await grantedPermissions(db, ['psychologist_payments.view', 'psychologist_payments.settle', 'finance.manage']);
      setAllowed(permissions.has('psychologist_payments.view'));
      if (!permissions.has('psychologist_payments.view')) return;
      let q = db.from('psychologist_session_payables').select('*,psychologist:outsourced_doctors(doctor_name),appointment:doctor_appointments(start_at)').order('due_date');
      if (status) q = q.eq('status', status);
      if (doctor) q = q.eq('psychologist_id', doctor);
      const [payables, accountRows] = await Promise.all([q, db.from('finance_accounts').select('id,name').eq('is_active', true).order('name')]);
      if (payables.error) throw payables.error;
      if (accountRows.error) throw accountRows.error;
      setRows(payables.data || []);
      setAccounts(accountRows.data || []);
    } catch (e: any) {
      setError(e.message || 'Unable to load psychologist payables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, doctor]);

  const doctors = useMemo(() => Array.from(new Map(rows.map(x => [x.psychologist_id, x.psychologist?.doctor_name || 'Psychologist'])).entries()), [rows]);
  const due = rows.filter(x => x.status === 'payment_due');
  const overdue = due.filter(x => x.due_date && x.due_date < today());
  const paid = rows.filter(x => x.status === 'paid');
  const pending = due.reduce((n, x) => n + Number(x.payable_amount), 0);
  const canSettle = settling && accountId && paidOn && !busy;

  const openSettlement = (payable: any) => {
    setError('');
    setSettling(payable);
    setAccountId(accounts.length === 1 ? accounts[0].id : '');
    setPaidOn(today());
    setReference('');
    setMethod('bank_transfer');
  };

  const settle = async () => {
    if (!settling || !accountId || !paidOn) return;
    setBusy(settling.id);
    setError('');
    try {
      const { error: rpcError } = await db.rpc('settle_psychologist_session_payable', {
        target_payable: settling.id,
        target_account: accountId,
        paid_on: paidOn,
        method,
        reference: reference.trim() || null,
      });
      if (rpcError) throw rpcError;
      setSettling(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Unable to settle payable.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <section><h1 className="text-2xl font-bold">Psychologist payments</h1><p className="mt-3 text-slate-500">Loading payment liabilities…</p></section>;
  if (!allowed) return <section><h1 className="text-2xl font-bold">Psychologist payments</h1><p className="mt-3 text-rose-700">You do not have permission to view psychologist payment liabilities.</p></section>;

  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold">Psychologist session payments</h1><p className="text-slate-500">Eligible online-session liabilities only. Clinical notes are not shown here.</p></div>
    {error && <p className="text-rose-700" role="alert">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Pending" value={inr(pending)} /><Metric label="Due soon" value={due.length - overdue.length} /><Metric label="Overdue" value={overdue.length} /><Metric label="Paid" value={paid.length} /></div>
    <div className="card flex flex-wrap gap-2 p-3">
      <select className="input" aria-label="Payment status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['payment_due', 'scheduled', 'paid', 'on_hold', 'cancelled'].map(x => <option key={x}>{x}</option>)}</select>
      <select className="input" aria-label="Psychologist" value={doctor} onChange={e => setDoctor(e.target.value)}><option value="">All psychologists</option>{doctors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
    </div>
    <div className="card overflow-x-auto"><table className="min-w-[780px] w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Psychologist</th><th className="p-3 text-left">Session</th><th className="p-3 text-left">Submitted</th><th className="p-3 text-right">Payable</th><th className="p-3 text-left">Due</th><th className="p-3 text-left">Status</th><th className="p-3" /></tr></thead><tbody>{rows.map(x => { const isOverdue = x.status === 'payment_due' && x.due_date < today(); return <tr className="border-b" key={x.id}><td className="p-3">{x.psychologist?.doctor_name}</td><td className="p-3">{x.session_date}</td><td className="p-3">{String(x.session_record_submitted_at).slice(0, 10)}</td><td className="p-3 text-right">{inr(x.payable_amount)}</td><td className="p-3">{x.due_date || 'Manual'}</td><td className="p-3"><FinanceStatus value={isOverdue ? 'overdue' : x.status} /></td><td className="p-3">{x.status === 'payment_due' && <button className="btn border" disabled={busy === x.id} onClick={() => openSettlement(x)}>Mark paid</button>}</td></tr>; })}</tbody></table>{!rows.length && <p className="p-6 text-slate-500">No psychologist session payables match these filters.</p>}</div>
    {settling && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-title"><div className="card w-full max-w-lg space-y-4 p-5 shadow-xl"><div><h2 id="settlement-title" className="text-xl font-bold">Confirm psychologist payment</h2><p className="text-sm text-slate-500">Review the liability and choose the account that paid it.</p></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Psychologist</dt><dd className="font-medium">{settling.psychologist?.doctor_name || 'Psychologist'}</dd></div><div><dt className="text-slate-500">Amount</dt><dd className="font-medium">{inr(settling.payable_amount)}</dd></div><div><dt className="text-slate-500">Due date</dt><dd className="font-medium">{settling.due_date || 'Manual'}</dd></div></dl><label className="block text-sm font-medium">Paid from account<select className="input mt-1 w-full" aria-label="Paid from account" value={accountId} onChange={e => setAccountId(e.target.value)} required><option value="">Select an active Finance account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="block text-sm font-medium">Payment date<input className="input mt-1 w-full" aria-label="Payment date" type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} required /></label><label className="block text-sm font-medium">Payment method<select className="input mt-1 w-full" aria-label="Payment method" value={method} onChange={e => setMethod(e.target.value)}>{['bank_transfer', 'cash', 'upi', 'card'].map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label><label className="block text-sm font-medium">Payment reference / note <span className="font-normal text-slate-500">(optional)</span><input className="input mt-1 w-full" aria-label="Payment reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={500} /></label><div className="flex justify-end gap-2"><button className="btn border" disabled={!!busy} onClick={() => setSettling(null)}>Cancel</button><button className="btn" disabled={!canSettle} onClick={() => void settle()}>{busy ? 'Settling…' : 'Confirm payment'}</button></div></div></div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <article className="card p-4"><p className="text-sm text-slate-500">{label}</p><b className="text-xl">{value}</b></article>; }
