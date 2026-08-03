'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminRepository } from '@/lib/admin-repository';
import { FinanceEmpty, FinanceStatus, inr } from '@/components/finance-ui';

const today = () => new Date().toISOString().slice(0, 10);

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState({ amount: '', payment_date: today(), account_id: '', payment_method: 'cash', reference: '', notes: '' });
  const load = async () => {
    try { setError(''); const [loadedInvoice, options] = await Promise.all([adminRepository.financeInvoice(id), adminRepository.financeOptions()]); setInvoice(loadedInvoice); setAccounts(options.accounts); setPayment(current => ({ ...current, account_id: current.account_id || options.accounts[0]?.id || '' })); }
    catch (caught: any) { setError(caught.message || 'Invoice details could not be loaded.'); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [id]);

  const totals = useMemo(() => {
    if (!invoice) return { subtotal: 0, total: 0, paid: 0, outstanding: 0 };
    const subtotal = (invoice.finance_invoice_items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0);
    const total = Math.max(0, subtotal + Number(invoice.tax || 0) - Number(invoice.discount || 0));
    const paid = (invoice.finance_invoice_payments || []).reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0);
    return { subtotal, total, paid, outstanding: Math.max(0, total - paid) };
  }, [invoice]);

  const setInvoiceStatus = async (status: 'sent' | 'cancelled') => {
    setSaving(true); setError('');
    try { await adminRepository.updateFinanceInvoice(id, { status }); setNotice(status === 'sent' ? 'Invoice marked as sent.' : 'Invoice cancelled.'); await load(); }
    catch (caught: any) { setError(caught.message || 'The invoice status could not be updated.'); }
    finally { setSaving(false); }
  };
  const recordPayment = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const amount = Number(payment.amount);
    if (!amount || amount <= 0) return setError('Enter a payment amount greater than zero.');
    if (amount > totals.outstanding) return setError(`Payment cannot exceed the outstanding balance of ${inr(totals.outstanding)}.`);
    if (!payment.account_id) return setError('Choose the account that received this payment.');
    setSaving(true);
    try {
      await adminRepository.recordInvoicePayment({ invoice_id: id, account_id: payment.account_id, amount, payment_date: payment.payment_date, payment_method: payment.payment_method, reference_number: payment.reference || null, notes: payment.notes || null });
      setNotice('Payment recorded and the invoice balance was refreshed.'); setPaymentOpen(false); setPayment({ amount: '', payment_date: today(), account_id: payment.account_id, payment_method: 'cash', reference: '', notes: '' }); await load();
    } catch (caught: any) { setError(caught.message || 'Payment could not be recorded. Please try again.'); }
    finally { setSaving(false); }
  };

  if (error && !invoice) return <section className="mx-auto max-w-5xl"><p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p></section>;
  if (!invoice) return <section className="mx-auto max-w-5xl"><div className="card p-6"><div className="h-6 w-48 animate-pulse rounded bg-slate-100" /><div className="mt-6 h-48 animate-pulse rounded bg-slate-100" /></div></section>;
  const isOverdue = invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date && invoice.due_date < today();
  const displayStatus = isOverdue ? 'overdue' : invoice.status;
  const canPay = totals.outstanding > 0 && !['draft', 'cancelled'].includes(invoice.status);

  return <section className="mx-auto max-w-5xl space-y-5 print:max-w-none">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><button className="mb-2 text-sm font-medium text-teal-700 hover:underline print:hidden" onClick={() => router.push('/admin/finance/invoices')}>← Back to invoices</button><p className="eyebrow">BsSmile · Customer invoice</p><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{invoice.invoice_number}</h1><FinanceStatus value={displayStatus} /></div><p className="mt-1 text-sm text-slate-600">Issued {invoice.issue_date} {invoice.due_date ? `· Due ${invoice.due_date}` : ''}</p></div><div className="flex flex-wrap gap-2 print:hidden">{invoice.status === 'draft' && <><button className="btn border" disabled={saving} onClick={() => void setInvoiceStatus('cancelled')}>Cancel invoice</button><button className="btn btn-primary" disabled={saving} onClick={() => void setInvoiceStatus('sent')}>{saving ? 'Saving…' : 'Mark sent'}</button></>}{canPay && <button className="btn btn-primary" onClick={() => setPaymentOpen(true)}>Record payment</button>}<button className="btn border" onClick={() => window.print()}>Print</button></div></div>
    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}{notice && <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{notice}</p>}
    <article className="card overflow-hidden"><div className="grid gap-5 border-b border-slate-100 p-6 md:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bill to</p><h2 className="mt-2 text-lg font-bold">{invoice.customer_name}</h2><p className="mt-1 text-sm text-slate-600">{invoice.customer_phone || 'No phone provided'}</p><p className="text-sm text-slate-600">{invoice.customer_email || 'No email provided'}</p></div><div className="md:text-right"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Amount due</p><p className="mt-2 text-3xl font-bold text-slate-950">{inr(totals.outstanding)}</p><p className="mt-1 text-sm text-slate-600">Total invoice value {inr(totals.total)}</p></div></div><div className="overflow-x-auto"><table className="min-w-[620px] w-full text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Description', 'Quantity', 'Rate', 'Amount'].map(label => <th className="px-6 py-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{invoice.finance_invoice_items.map((item: any) => <tr className="border-t border-slate-100" key={item.id}><td className="px-6 py-4 font-medium">{item.description}</td><td className="px-6 py-4">{item.quantity}</td><td className="px-6 py-4">{inr(item.rate)}</td><td className="px-6 py-4 font-semibold">{inr(Number(item.quantity) * Number(item.rate))}</td></tr>)}</tbody></table></div><div className="grid gap-5 border-t border-slate-100 p-6 md:grid-cols-[1fr_300px]"><div>{invoice.notes && <><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes / payment instructions</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{invoice.notes}</p></>}</div><dl className="space-y-2 text-sm"><TotalRow label="Subtotal" value={inr(totals.subtotal)} /><TotalRow label="Discount" value={`− ${inr(invoice.discount)}`} /><TotalRow label="Tax" value={inr(invoice.tax)} /><TotalRow label="Total" value={inr(totals.total)} emphasized /><TotalRow label="Paid" value={inr(totals.paid)} /><TotalRow label="Balance" value={inr(totals.outstanding)} emphasized /></dl></div></article>
    <section className="card"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Payment history</h2><p className="mt-1 text-sm text-slate-500">Payments posted to this invoice and their receiving account.</p></div>{invoice.finance_invoice_payments?.length ? <div className="divide-y divide-slate-100">{invoice.finance_invoice_payments.map((entry: any) => <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={entry.id}><div><b>{inr(entry.amount)}</b><p className="mt-1 text-sm text-slate-600">{entry.payment_date} · {entry.finance_accounts?.name || 'Account unavailable'} · {entry.payment_method || 'Method not recorded'}</p>{entry.reference_number && <p className="mt-1 text-xs text-slate-500">Reference: {entry.reference_number}</p>}</div><span className="text-xs text-slate-500">Payment recorded</span></div>)}</div> : <FinanceEmpty>No payments have been recorded yet.</FinanceEmpty>}</section>
    {paymentOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-3 sm:p-4"><form className="card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden" onSubmit={recordPayment}><div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="text-lg font-bold">Record payment</h2><p className="mt-1 text-sm text-slate-600">Outstanding balance: <b>{inr(totals.outstanding)}</b></p></div><button className="text-slate-500 hover:text-slate-950" type="button" onClick={() => setPaymentOpen(false)}>Close</button></div><div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2"><Label label="Payment amount"><input required className="input" min="0.01" max={totals.outstanding} step="0.01" type="number" value={payment.amount} onChange={event => setPayment({ ...payment, amount: event.target.value })} /></Label><Label label="Payment date"><input required className="input" type="date" value={payment.payment_date} onChange={event => setPayment({ ...payment, payment_date: event.target.value })} /></Label><Label label="Receiving account"><select required className="input" value={payment.account_id} onChange={event => setPayment({ ...payment, account_id: event.target.value })}><option value="">Select account</option>{accounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Label><Label label="Payment method"><select required className="input" value={payment.payment_method} onChange={event => setPayment({ ...payment, payment_method: event.target.value })}>{['cash', 'bank_transfer', 'upi', 'card'].map(value => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></Label><Label label="Reference"><input className="input" value={payment.reference} onChange={event => setPayment({ ...payment, reference: event.target.value })} /></Label><Label label="Notes"><input className="input" value={payment.notes} onChange={event => setPayment({ ...payment, notes: event.target.value })} /></Label></div><div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white p-5"><button className="btn border" type="button" onClick={() => setPaymentOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</button></div></form></div>}
  </section>;
}

function TotalRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) { return <div className={`flex justify-between ${emphasized ? 'border-t border-slate-200 pt-2 font-bold text-slate-950' : 'text-slate-600'}`}><dt>{label}</dt><dd>{value}</dd></div>; }
function Label({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span>{label}</span><div className="mt-1.5">{children}</div></label>; }
