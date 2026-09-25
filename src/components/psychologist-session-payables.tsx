'use client';
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { inr, FinanceStatus } from '@/components/finance-ui';
import { grantedPermissions } from '@/lib/granted-permissions';

const db: any = supabase;
const today = () => new Date().toISOString().slice(0, 10);
const paymentStatuses = ['payment_due', 'scheduled', 'paid', 'on_hold', 'cancelled'];
const methods = ['bank_transfer', 'cash', 'upi', 'card'];
type PaymentForm = {
  psychologistId: string;
  amount: string;
  dueDate: string;
  status: string;
  paidOn: string;
  accountId: string;
  method: string;
  notes: string;
};

const blankForm = (): PaymentForm => ({
  psychologistId: '', amount: '', dueDate: '', status: 'payment_due', paidOn: today(),
  accountId: '', method: 'bank_transfer', notes: '',
});

export function PsychologistSessionPayables() {
  const [rows, setRows] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [canSettlePermission, setCanSettlePermission] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [doctor, setDoctor] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settling, setSettling] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PaymentForm>(blankForm);
  const [accountId, setAccountId] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('bank_transfer');

  const load = async () => {
    if (!db) return;
    setLoading(true);
    try {
      const permissions = await grantedPermissions(db, ['psychologist_payments.view', 'psychologist_payments.settle', 'psychologist_payments.manage']);
      const canView = permissions.has('psychologist_payments.view');
      const canManagePayments = permissions.has('psychologist_payments.manage');
      setAllowed(canView);
      setCanSettlePermission(permissions.has('psychologist_payments.settle'));
      setCanManage(canManagePayments);
      if (!canView) return;
      let q = db.from('psychologist_session_payables').select('*,psychologist:outsourced_doctors(doctor_name),appointment:doctor_appointments(start_at,end_at),paid_by_profile:profiles!psychologist_session_payables_paid_by_fkey(full_name)').order('due_date');
      if (status) q = q.eq('status', status);
      if (doctor) q = q.eq('psychologist_id', doctor);
      if (dueFrom) q = q.gte('due_date', dueFrom);
      if (dueTo) q = q.lte('due_date', dueTo);
      const [payables, accountRows, directoryRows] = await Promise.all([
        q,
        permissions.has('psychologist_payments.settle') ? db.rpc('psychologist_payment_accounts') : Promise.resolve({ data: [], error: null }),
        canManagePayments ? db.rpc('psychologist_payment_directory') : Promise.resolve({ data: [], error: null }),
      ]);
      if (payables.error) throw payables.error;
      if (accountRows.error) throw accountRows.error;
      if (directoryRows.error) throw directoryRows.error;
      setRows(payables.data || []);
      setAccounts(accountRows.data || []);
      setDoctors(directoryRows.data || []);
    } catch (e: any) {
      setError(e.message || 'Unable to load psychologist payables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, doctor, dueFrom, dueTo]);

  // Keep the existing scheduled and due amounts in the Pending total.
  const scheduled = rows.filter(x => x.status === 'scheduled');
  const due = rows.filter(x => x.status === 'payment_due');
  const overdue = due.filter(x => x.due_date && x.due_date < today());
  const paid = rows.filter(x => x.status === 'paid');
  const pendingAmount = [...scheduled, ...due].reduce((n, x) => n + Number(x.payable_amount), 0);
  const paidAmount = paid.reduce((n, x) => n + Number(x.payable_amount), 0);
  const canSettle = settling && accountId && paidOn && !busy;
  const selectedDoctor = useMemo(() => doctors.find(x => x.psychologist_id === form.psychologistId), [doctors, form.psychologistId]);
  const psychologistOptions = useMemo(() => {
    const options = new Map<string, string>(doctors.map(x => [x.psychologist_id, x.psychologist_name]));
    rows.forEach(x => options.set(x.psychologist_id, x.clinician_name_snapshot || x.psychologist?.doctor_name || 'Psychologist'));
    return Array.from(options.entries());
  }, [doctors, rows]);

  const openCreate = () => { setEditing(null); setForm(blankForm()); setError(''); setNotice(''); setFormOpen(true); };
  const openEdit = (payment: any) => {
    setEditing(payment);
    setForm({ psychologistId: payment.psychologist_id, amount: String(payment.payable_amount), dueDate: payment.due_date || '', status: payment.status, paidOn: today(), accountId: '', method: 'bank_transfer', notes: payment.notes || '' });
    setError(''); setNotice(''); setFormOpen(true);
  };
  const closeForm = () => { setEditing(null); setForm(blankForm()); setFormOpen(false); };

  const saveManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.psychologistId) { setError('Select a psychologist.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid amount greater than zero.'); return; }
    if (!form.dueDate) { setError('Choose a due date.'); return; }
    if (form.status === 'paid' && (!form.paidOn || !form.accountId)) { setError('Choose a payment date and Finance account for a paid payment.'); return; }
    setBusy('manual'); setError(''); setNotice('');
    try {
      const result = editing
        ? await db.rpc('update_manual_psychologist_payment', {
            target_payable: editing.id, target_psychologist: form.psychologistId,
            target_amount: amount, target_due_date: form.dueDate,
            target_status: form.status, target_notes: form.notes.trim() || null,
          })
        : await db.rpc('create_manual_psychologist_payment', {
            target_psychologist: form.psychologistId, target_amount: amount,
            target_due_date: form.dueDate, target_status: form.status,
            target_paid_on: form.status === 'paid' ? form.paidOn : null,
            target_notes: form.notes.trim() || null,
            target_account: form.status === 'paid' ? form.accountId : null,
            method: form.method, reference: null,
          });
      if (result.error) throw result.error;
      closeForm();
      setNotice(editing ? 'Manual payment updated.' : 'Psychologist payment created.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Unable to save psychologist payment.');
    } finally { setBusy(''); }
  };

  const openSettlement = (payable: any) => {
    setError(''); setNotice(''); setSettling(payable);
    setAccountId(accounts.length === 1 ? accounts[0].id : '');
    setPaidOn(today()); setReference(''); setMethod('bank_transfer');
  };
  const settle = async () => {
    if (!settling || !accountId || !paidOn) return;
    setBusy(settling.id); setError(''); setNotice('');
    try {
      const { error: rpcError } = await db.rpc('settle_psychologist_session_payable', {
        target_payable: settling.id, target_account: accountId,
        paid_on: paidOn, method, reference: reference.trim() || null,
      });
      if (rpcError) throw rpcError;
      setSettling(null); setNotice('Payment marked paid.'); await load();
    } catch (e: any) { setError(e.message || 'Unable to settle payable.'); }
    finally { setBusy(''); }
  };

  if (loading) return <section><h1 className="text-2xl font-bold">Psychologist payments</h1><p className="mt-3 text-slate-500">Loading payment liabilities…</p></section>;
  if (!allowed) return <section><h1 className="text-2xl font-bold">Psychologist payments</h1><p className="mt-3 text-rose-700">You do not have permission to view psychologist payment liabilities.</p></section>;

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Psychologist payments</h1><p className="text-slate-500">Generated session payables and manual psychologist payments.</p></div>{canManage && <button className="btn" onClick={openCreate}>+ Add Psychologist Payment</button>}</div>
    {error && <p className="text-rose-700" role="alert">{error}</p>}
    {notice && <p className="text-emerald-700" role="status">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="Pending" value={inr(pendingAmount)} /><Metric label="Scheduled" value={scheduled.length} /><Metric label="Due soon" value={due.length - overdue.length} /><Metric label="Overdue" value={overdue.length} /><Metric label="Paid" value={paid.length} /><Metric label="Total paid" value={inr(paidAmount)} /></div>
    <div className="card flex flex-wrap gap-2 p-3">
      <select className="input" aria-label="Payment status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{paymentStatuses.map(x => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}</select>
      <select className="input" aria-label="Psychologist" value={doctor} onChange={e => setDoctor(e.target.value)}><option value="">All psychologists</option>{psychologistOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <label className="flex items-center gap-2 text-sm text-slate-600">Due from<input className="input" aria-label="Due date from" type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm text-slate-600">Due to<input className="input" aria-label="Due date to" type="date" value={dueTo} onChange={e => setDueTo(e.target.value)} /></label>
    </div>
    <div className="card overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-left">Psychologist</th><th className="p-3 text-left">Session</th><th className="p-3 text-right">Payable</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Paid</th><th className="p-3 text-left">Source / details</th><th className="p-3" /></tr></thead><tbody>{rows.map(x => {
      const isOverdue = x.status === 'payment_due' && x.due_date && x.due_date < today();
      const psychologistName = x.clinician_name_snapshot || x.psychologist?.doctor_name || 'Psychologist';
      const isManual = x.source === 'manual';
      const canMarkPaid = canSettlePermission && (x.status === 'payment_due' || x.status === 'scheduled');
      return <tr className="border-b" key={x.id}>
        <td className="p-3">{psychologistName}</td>
        <td className="p-3">{isManual ? <>Manual payment<br /><small>Due {x.due_date || '—'}</small></> : <>{x.session_date} · {x.session_duration_minutes || '—'} min<br /><small>{x.appointment_id}</small><br /><small>Due {x.due_date || '—'}</small></>}</td>
        <td className="p-3 text-right">{inr(x.payable_amount)}</td>
        <td className="p-3"><FinanceStatus value={isOverdue ? 'overdue' : x.status} /></td>
        <td className="p-3">{x.paid_at ? <>{String(x.paid_at).slice(0, 10)}<br /><small>{x.paid_by_profile?.full_name || x.paid_by}</small></> : '—'}</td>
        <td className="p-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${isManual ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-700'}`}>{isManual ? 'Manual' : 'Automatic'}</span>{x.notes && <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-slate-500">{x.notes}</p>}</td>
        <td className="p-3"><div className="flex gap-2">{canManage && isManual && x.status !== 'paid' && x.status !== 'cancelled' && <button className="btn border" disabled={!!busy} onClick={() => openEdit(x)}>Edit</button>}{canMarkPaid && <button className="btn border" disabled={busy === x.id} onClick={() => openSettlement(x)}>Mark paid</button>}</div></td>
      </tr>;
    })}</tbody></table>{!rows.length && <p className="p-6 text-slate-500">No psychologist payments match these filters.</p>}</div>
    {formOpen && <ManualPaymentDialog editing={editing} doctors={doctors} accounts={accounts} form={form} setForm={setForm} selectedDoctor={selectedDoctor} canSettlePermission={canSettlePermission} busy={busy} error={error} onCancel={closeForm} onSubmit={saveManual} />}
    {settling && <SettlementDialog settling={settling} accounts={accounts} accountId={accountId} setAccountId={setAccountId} paidOn={paidOn} setPaidOn={setPaidOn} method={method} setMethod={setMethod} reference={reference} setReference={setReference} busy={busy} canSettle={!!canSettle} onCancel={() => setSettling(null)} onSubmit={() => void settle()} />}
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <article className="card p-4"><p className="text-sm text-slate-500">{label}</p><b className="text-xl">{value}</b></article>; }

function ManualPaymentDialog({ editing, doctors, accounts, form, setForm, selectedDoctor, canSettlePermission, busy, error, onCancel, onSubmit }: any) {
  const update = (field: keyof PaymentForm, value: string) => setForm((current: PaymentForm) => ({ ...current, [field]: value }));
  const availableStatuses = editing ? ['payment_due', 'scheduled'] : canSettlePermission ? ['payment_due', 'paid'] : ['payment_due'];
  return <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="manual-payment-title">
    <form className="card my-auto max-h-[94dvh] w-full max-w-xl space-y-4 overflow-y-auto p-5 shadow-xl sm:max-h-[90dvh]" onSubmit={onSubmit}>
      <header><h2 id="manual-payment-title" className="text-xl font-bold">{editing ? 'Edit psychologist payment' : 'Add psychologist payment'}</h2><p className="text-sm text-slate-500">Record a manual psychologist payment in the Finance ledger.</p></header>
      {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
      <label className="block text-sm font-medium">Psychologist<select className="input mt-1 w-full" aria-label="Psychologist" value={form.psychologistId} onChange={e => update('psychologistId', e.target.value)} required><option value="">Select a psychologist</option>{doctors.map((person: any) => <option key={person.psychologist_id} value={person.psychologist_id}>{person.psychologist_name}</option>)}</select>{selectedDoctor && <span className="mt-1 block text-xs text-slate-500">Selected: {selectedDoctor.psychologist_name}</span>}</label>
      <label className="block text-sm font-medium">Amount (INR)<input className="input mt-1 w-full" aria-label="Amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={e => update('amount', e.target.value)} required /></label>
      <label className="block text-sm font-medium">Due date<input className="input mt-1 w-full" aria-label="Due date" type="date" value={form.dueDate} onChange={e => update('dueDate', e.target.value)} required /></label>
      <label className="block text-sm font-medium">Payment status<select className="input mt-1 w-full" aria-label="Payment status" value={form.status} onChange={e => update('status', e.target.value)}>{availableStatuses.map((value: string) => <option key={value} value={value}>{value === 'payment_due' ? 'Pending' : value.replaceAll('_', ' ')}</option>)}</select></label>
      {form.status === 'paid' && !editing && <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Payment date<input className="input mt-1 w-full" aria-label="Payment date" type="date" value={form.paidOn} onChange={e => update('paidOn', e.target.value)} required /></label><label className="block text-sm font-medium">Paid from account<select className="input mt-1 w-full" aria-label="Paid from account" value={form.accountId} onChange={e => update('accountId', e.target.value)} required><option value="">Select active account</option>{accounts.map((account: any) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="block text-sm font-medium sm:col-span-2">Payment method<select className="input mt-1 w-full" aria-label="Payment method" value={form.method} onChange={e => update('method', e.target.value)}>{methods.map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label></div>}
      <label className="block text-sm font-medium">Notes <span className="font-normal text-slate-500">(optional)</span><textarea className="input mt-1 min-h-24 w-full" aria-label="Notes" maxLength={2000} value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Consultation settlement, adjustment, previous period…" /></label>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn border" disabled={!!busy} onClick={onCancel}>Cancel</button><button type="submit" className="btn" disabled={!!busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add payment'}</button></div>
    </form>
  </div>;
}

function SettlementDialog({ settling, accounts, accountId, setAccountId, paidOn, setPaidOn, method, setMethod, reference, setReference, busy, canSettle, onCancel, onSubmit }: any) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-title"><div className="card w-full max-w-lg space-y-4 p-5 shadow-xl"><div><h2 id="settlement-title" className="text-xl font-bold">Confirm psychologist payment</h2><p className="text-sm text-slate-500">Review the liability and choose the account that paid it.</p></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Psychologist</dt><dd className="font-medium">{settling.clinician_name_snapshot || settling.psychologist?.doctor_name || 'Psychologist'}</dd></div><div><dt className="text-slate-500">Amount</dt><dd className="font-medium">{inr(settling.payable_amount)}</dd></div><div><dt className="text-slate-500">Due date</dt><dd className="font-medium">{settling.due_date || 'Manual'}</dd></div></dl><label className="block text-sm font-medium">Paid from account<select className="input mt-1 w-full" aria-label="Paid from account" value={accountId} onChange={e => setAccountId(e.target.value)} required><option value="">Select an active Finance account</option>{accounts.map((account: any) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="block text-sm font-medium">Payment date<input className="input mt-1 w-full" aria-label="Payment date" type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} required /></label><label className="block text-sm font-medium">Payment method<select className="input mt-1 w-full" aria-label="Payment method" value={method} onChange={e => setMethod(e.target.value)}>{methods.map(value => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label><label className="block text-sm font-medium">Payment reference / note <span className="font-normal text-slate-500">(optional)</span><input className="input mt-1 w-full" aria-label="Payment reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={500} /></label><div className="flex justify-end gap-2"><button type="button" className="btn border" disabled={!!busy} onClick={onCancel}>Cancel</button><button type="button" className="btn" disabled={!canSettle} onClick={onSubmit}>{busy ? 'Settling…' : 'Confirm payment'}</button></div></div></div>;
}
