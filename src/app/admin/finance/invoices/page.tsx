'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { adminRepository } from '@/lib/admin-repository';
import { FinanceEmpty, FinanceStatus, inr } from '@/components/finance-ui';

const totalFor = (invoice: any) => Math.max(0, (invoice.finance_invoice_items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0) + Number(invoice.tax || 0) - Number(invoice.discount || 0));
const paidFor = (invoice: any) => (invoice.finance_invoice_payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);

export default function Invoices() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  useEffect(() => {
    const load = async () => {
      try { setError(''); setItems(await adminRepository.financeInvoices()); }
      catch (caught: any) { setError(caught.message || 'Invoices could not be loaded. Please try again.'); }
      finally { setLoading(false); }
    };
    void load();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const shown = useMemo(() => items.filter(invoice => {
    const matchesSearch = !search || [invoice.invoice_number, invoice.customer_name, invoice.customer_email].some(value => String(value || '').toLowerCase().includes(search.toLowerCase()));
    const isOverdue = invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date && invoice.due_date < today;
    return matchesSearch && (!status || invoice.status === status) && (!from || invoice.issue_date >= from) && (!to || invoice.issue_date <= to) && (!overdueOnly || isOverdue);
  }), [items, search, status, from, to, overdueOnly, today]);
  const totalInvoices = items.length;
  const outstanding = items.reduce((sum, invoice) => Math.max(0, totalFor(invoice) - paidFor(invoice)) + sum, 0);
  const paidThisMonth = items.reduce((sum, invoice) => sum + (invoice.finance_invoice_payments || []).filter((payment: any) => String(payment.payment_date || '').slice(0, 7) === today.slice(0, 7)).reduce((payments: number, payment: any) => payments + Number(payment.amount || 0), 0), 0);
  const overdue = items.filter(invoice => invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date && invoice.due_date < today).reduce((sum, invoice) => sum + Math.max(0, totalFor(invoice) - paidFor(invoice)), 0);

  return <section className="mx-auto max-w-[1320px] space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Finance</p><h1 className="text-2xl font-bold">Invoices</h1><p className="mt-1 text-sm text-slate-600">Track customer invoices, collections, and outstanding balances.</p></div><Link className="btn btn-primary" href="/admin/finance/invoices/new">Create invoice</Link></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Total invoices', String(totalInvoices), 'All active invoices'], ['Outstanding', inr(outstanding), 'Awaiting collection'], ['Paid this month', inr(paidThisMonth), 'Payments received'], ['Overdue amount', inr(overdue), overdue ? 'Needs attention' : 'Nothing overdue'],
    ].map(([label, value, hint], index) => <div className={`card p-4 ${index === 3 && overdue ? 'border-rose-200' : ''}`} key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>)}</div>
    <div className="card grid gap-2 p-3 md:grid-cols-[minmax(220px,1fr)_150px_150px_150px_auto]"><input className="input" placeholder="Search invoice or customer" value={search} onChange={event => setSearch(event.target.value)} /><select className="input" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'].map(value => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select><input className="input" aria-label="From invoice date" type="date" value={from} onChange={event => setFrom(event.target.value)} /><input className="input" aria-label="To invoice date" type="date" value={to} onChange={event => setTo(event.target.value)} /><label className="flex items-center gap-2 px-2 text-sm font-medium"><input type="checkbox" checked={overdueOnly} onChange={event => setOverdueOnly(event.target.checked)} />Overdue only</label></div>
    {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    <div className="card overflow-x-auto"><table className="min-w-[1060px] w-full text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Invoice number', 'Customer', 'Invoice date', 'Due date', 'Total', 'Paid', 'Balance', 'Status', 'Actions'].map(label => <th className="px-4 py-3 text-left font-semibold" key={label}>{label}</th>)}</tr></thead><tbody>{loading ? Array.from({ length: 4 }, (_, index) => <tr className="border-t" key={index}><td colSpan={9} className="px-4 py-5"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td></tr>) : shown.map(invoice => { const total = totalFor(invoice); const paid = paidFor(invoice); const balance = Math.max(0, total - paid); const renderedStatus = invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date && invoice.due_date < today ? 'overdue' : invoice.status; return <tr className="border-t border-slate-100" key={invoice.id}><td className="px-4 py-3"><Link className="font-bold text-teal-700 hover:underline" href={`/admin/finance/invoices/${invoice.id}`}>{invoice.invoice_number}</Link></td><td className="px-4 py-3"><b>{invoice.customer_name}</b><small className="block text-slate-500">{invoice.customer_email || invoice.customer_phone || '—'}</small></td><td className="px-4 py-3">{invoice.issue_date}</td><td className="px-4 py-3">{invoice.due_date || '—'}</td><td className="px-4 py-3 font-semibold">{inr(total)}</td><td className="px-4 py-3">{inr(paid)}</td><td className="px-4 py-3 font-semibold">{inr(balance)}</td><td className="px-4 py-3"><FinanceStatus value={renderedStatus} /></td><td className="px-4 py-3"><Link className="font-medium text-teal-700 hover:underline" href={`/admin/finance/invoices/${invoice.id}`}>View</Link></td></tr>; })}</tbody></table>{!loading && !shown.length && <FinanceEmpty>No invoices match these filters. Create an invoice to start tracking collections.</FinanceEmpty>}</div>
  </section>;
}
