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
  const [summaryRows, setSummaryRows] = useState<any[]>([]);
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
  const [clinicians, setClinicians] = useState<any[]>([]);
  const [rate, setRate] = useState('');
  const [rateDoctor, setRateDoctor] = useState('');
  const [canManage, setCanManage] = useState(false);

  const load = async () => {
    if (!db) return;
    setLoading(true);
    try {
      const permissions = await grantedPermissions(db, ['psychologist_payments.view', 'psychologist_payments.manage', 'psychologist_payments.settle', 'finance.manage']);
      setAllowed(permissions.has('psychologist_payments.view'));
      setCanManage(permissions.has('psychologist_payments.manage'));
      if (!permissions.has('psychologist_payments.view')) return;
      const summaryQuery = db.from('psychologist_session_payables').select('status,payable_amount,due_date');
      let q = db.from('psychologist_session_payables').select('*,psychologist:outsourced_doctors(doctor_name),appointment:doctor_appointments(start_at)').order('due_date');
      if (status) q = q.eq('status', status);
      if (doctor) q = q.eq('psychologist_id', doctor);
      const [payables, summaries, accountRows, clinicianRows] = await Promise.all([q, summaryQuery, db.from('finance_accounts').select('id,name').eq('is_active', true).order('name'), db.rpc('eligible_psychologist_payment_clinicians')]);
      if (payables.error) throw payables.error;
      if (summaries.error) throw summaries.error;
      if (accountRows.error) throw accountRows.error;
      setRows(payables.data || []);
      setSummaryRows(summaries.data || []);
      setAccounts(accountRows.data || []);
      if (clinicianRows.error) throw clinicianRows.error;
      setClinicians(clinicianRows.data || []);
    } catch (e: any) {
      setError(e.message || 'Unable to load psychologist payables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, doctor]);

  const doctors = useMemo(() => clinicians.map(clinician => [clinician.id, clinician.doctor_name] as const), [clinicians]);
  const due = summaryRows.filter(x => x.status === 'payment_due');
  const overdue = due.filter(x => x.due_date && x.due_date < today());
  const paid = summaryRows.filter(x => x.status === 'paid');
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

  const saveRate = async () => {
    const amount = Number(rate);
    if (!rateDoctor || !Number.isFinite(amount) || amount <= 0) { setError('Choose an outsourced clinician and enter a positive INR session rate.'); return; }
    setBusy('rate'); setError('');
    try {
      const { error: saveError } = await db.from('psychologist_payout_settings').upsert({ doctor_id: rateDoctor, default_session_payout: amount, is_active: true }, { onConflict: 'doctor_id' });
      if (saveError) throw saveError;
      setRate(''); await load();
    } catch (e: any) { setError(e.message || 'Unable to save payment configuration.'); }
    finally { setBusy(''); }
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
    <div><h1 className="text-2xl font-bold">Psychologist session payments</h1><p className="text-slate-500">Completed outsourced-clinician session liabilities. Clinical notes are not shown here.</p></div>
    {error && <p className="text-rose-700" role="alert">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Pending" value={inr(pending)} /><Metric label="Due soon" value={due.length - overdue.length} /><Metric label="Overdue" value={overdue.length} /><Metric label="Paid" value={paid.length} /></div>
    <div className="card flex flex-wrap gap-2 p-3">
      <select className="input" aria-label="Payment status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['payment_due', 'scheduled', 'paid', 'on_hold', 'cancelled'].map(x => <option key={x}>{x}</option>)}</select>
      <select className="input" aria-label="Psychologist" value={doctor} onChange={e => setDoctor(e.target.value)}><option value="">All psychologists</option>{doctors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
    </div>
    {canManage && <div className="card space-y-3 p-4"><div><h2 className="font-semibold">Outsourced clinician payment configuration</h2><p className="text-sm text-slate-500">Set an INR rate per completed session. A missing rate prevents liability creation; no ₹0 payable is generated.</p></div><div className="flex flex-wrap gap-2"><select className="input" aria-label="Outsourced clinician payment configuration" value={rateDoctor} onChange={e => setRateDoctor(e.target.value)}><option value="">Select outsourced clinician</option>{clinicians.map(clinician => <option key={clinician.id} value={clinician.id}>{clinician.doctor_name} · {clinician.consultation_duration_minutes} min{clinician.payment_configured ? ` · ₹${clinician.default_session_payout}/session` : ' · Payment configuration required'}</option>)}</select><input className="input" aria-label="INR per completed session" type="number" min="0.01" step="0.01" placeholder="INR per completed session" value={rate} onChange={e => setRate(e.target.value)} /><button className="btn" disabled={busy === 'rate'} onClick={() => void saveRate()}>{busy === 'rate' ? 'Saving…' : 'Save rate'}</button></div></div>}
    <div className="card overflow-x-auto"><table className="min-w-[780px] w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Psychologist</th><th className="p-3 text-left">Session</th><th className="p-3 text-left">Completed</th><th className="p-3 text-right">Payable</th><th className="p-3 text-left">Due</th><th className="p-3 text-left">Status</th><th className="p-3" /></tr></thead><tbody>{rows.map(x => { const isOverdue = x.status === 'payment_due' && x.due_date < today(); return <tr className="border-b" key={x.id}><td className="p-3">{x.clinician_name_snapshot || x.psychologist?.doctor_name}</td><td className="p-3">{x.session_date}</td><td className="p-3">{String(x.session_completed_at).slice(0, 10)}</td><td className="p-3 text-right">{inr(x.payable_amount)}</td><td className="p-3">{x.due_date || 'Manual'}</td><td className="p-3"><FinanceStatus value={isOverdue ? 'overdue' : x.status} /></td><td className="p-3">{x.status === 'payment_due' && <button className="btn border" disabled={busy === x.id} onClick={() => openSettlement(x)}>Mark paid</button>}</td></tr>; })}</tbody></table>{!rows.length && <p className="p-6 text-slate-500">No psychologist session payables match these filters.</p>}</div>
    {settling && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-title"><div className="card w-full max-w-lg space-y-4 p-5 shadow-xl"><div><h2 id="settlement-title" className="text-xl font-bold">Confirm psychologist payment</h2><p className="text-sm text-slate-500">Review the liability and choose the account that paid it.</p></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Psychologist</dt><dd className="font-medium">{settling.psychologist?.doctor_name || 'Psychologist'}</dd></div><div><dt className="text-slate-500">Amount</dt><dd className="font-medium">{inr(settling.payable_amount)}</dd></div><div><dt className="text-slate-500">Due date</dt><dd className="font-medium">{settling.due_date || 'Manual'}</dd></div></dl><label className="block text-sm font-medium">Paid from account<select className="input mt-1 w-full" aria-label="Paid from account" value={accountId} onChange={e => setAccountId(e.target.value)} required><option value="">Select an active Finance account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="block text-sm font-medium">Payment date<input className="input mt-1 w-full" aria-label="Payment date" type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} required /></label><label className="block text-sm font-medium">Payment method<select className="input mt-1 w-full" aria-label="Payment method" value={method} onChange={e => setMethod(e.target.value)}>{['bank_transfer', 'cash', 'upi', 'card'].map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label><label className="block text-sm font-medium">Payment reference / note <span className="font-normal text-slate-500">(optional)</span><input className="input mt-1 w-full" aria-label="Payment reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={500} /></label><div className="flex justify-end gap-2"><button className="btn border" disabled={!!busy} onClick={() => setSettling(null)}>Cancel</button><button className="btn" disabled={!canSettle} onClick={() => void settle()}>{busy ? 'Settling…' : 'Confirm payment'}</button></div></div></div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <article className="card p-4"><p className="text-sm text-slate-500">{label}</p><b className="text-xl">{value}</b></article>; }
