'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { adminRepository } from '@/lib/admin-repository';
import { inr } from '@/components/finance-ui';
import { invoiceTotal, invoiceValidationMessage } from '@/lib/finance-rules';

type InvoiceItem = { description: string; quantity: number; rate: number };

const initialForm = {
  customer_name: '', customer_phone: '', customer_email: '',
  issue_date: new Date().toISOString().slice(0, 10), due_date: '',
  discount: 0, tax: 0, notes: '',
};

export default function NewInvoice() {
  const router = useRouter();
  const [form, setForm] = useState<any>(initialForm);
  const [items, setItems] = useState<InvoiceItem[]>([{ description: '', quantity: 1, rate: 0 }]);
  const [saving, setSaving] = useState<'draft' | 'sent' | null>(null);
  const [error, setError] = useState('');
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0), [items]);
  const total = invoiceTotal(items, Number(form.discount || 0), Number(form.tax || 0));

  function updateItem(index: number, patch: Partial<InvoiceItem>) {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function save(status: 'draft' | 'sent', event?: FormEvent) {
    event?.preventDefault();
    setError('');
    if (!form.customer_name.trim()) return setError('Customer name is required.');
    const validation = invoiceValidationMessage(items, Number(form.discount), Number(form.tax));
    if (validation) return setError(validation);
    if (form.due_date && form.due_date < form.issue_date) return setError('Due date cannot be earlier than the invoice date.');
    setSaving(status);
    try {
      const profile = await currentProfile() as any;
      if (!profile) throw new Error('Your session has expired. Please sign in again.');
      const invoice = await adminRepository.createFinanceInvoice({
        ...form,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        customer_email: form.customer_email.trim() || null,
        due_date: form.due_date || null,
        invoice_number: `INV-${Date.now()}`,
        created_by: profile.id,
        status,
      }, items.map(item => ({ ...item, description: item.description.trim() })));
      router.push(`/admin/finance/invoices/${invoice.id}`);
    } catch (caught: any) {
      setError(caught.message || 'Unable to save this invoice.');
    } finally {
      setSaving(null);
    }
  }

  return <section className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-2xl font-bold">New invoice</h1><p className="mt-1 text-sm text-slate-600">Create a customer invoice in INR.</p></div>
    <form className="space-y-5" onSubmit={event => void save('draft', event)}>
      {error && <p className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <section className="card p-5">
        <h2 className="text-lg font-bold">Customer details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Customer name" required><input className="input" autoComplete="name" value={form.customer_name} onChange={event => setForm({ ...form, customer_name: event.target.value })} /></Field>
          <Field label="Phone number"><input className="input" type="tel" autoComplete="tel" value={form.customer_phone} onChange={event => setForm({ ...form, customer_phone: event.target.value })} /></Field>
          <Field label="Email address"><input className="input" type="email" autoComplete="email" value={form.customer_email} onChange={event => setForm({ ...form, customer_email: event.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Invoice date" required><input className="input" required type="date" value={form.issue_date} onChange={event => setForm({ ...form, issue_date: event.target.value })} /></Field><Field label="Due date"><input className="input" type="date" min={form.issue_date} value={form.due_date} onChange={event => setForm({ ...form, due_date: event.target.value })} /></Field></div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-lg font-bold">Invoice items</h2><p className="mt-1 text-sm text-slate-600">Amounts are calculated automatically.</p></div>
        <div className="overflow-x-auto p-5">
          <div className="min-w-[650px]">
            <div className="grid grid-cols-[minmax(240px,1fr)_110px_140px_130px_76px] gap-3 border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500"><span>Description</span><span>Quantity</span><span>Rate (₹)</span><span className="text-right">Amount</span><span aria-label="Actions" /></div>
            <div className="space-y-3 pt-3">{items.map((item, index) => <div className="grid grid-cols-[minmax(240px,1fr)_110px_140px_130px_76px] items-center gap-3" key={index}>
              <input className="input" aria-label={`Item ${index + 1} description`} placeholder="Service or item description" value={item.description} onChange={event => updateItem(index, { description: event.target.value })} />
              <input className="input" aria-label={`Item ${index + 1} quantity`} type="number" min="1" step="0.01" value={item.quantity} onChange={event => updateItem(index, { quantity: Number(event.target.value) })} />
              <input className="input" aria-label={`Item ${index + 1} rate`} type="number" min="0" step="0.01" value={item.rate} onChange={event => updateItem(index, { rate: Number(event.target.value) })} />
              <output className="text-right text-sm font-bold">{inr(Number(item.quantity || 0) * Number(item.rate || 0))}</output>
              <button type="button" className="btn border text-sm" disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>)}</div>
            <button type="button" className="btn mt-4 border text-sm" onClick={() => setItems(current => [...current, { description: '', quantity: 1, rate: 0 }])}>+ Add item</button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="card p-5"><Field label="Notes"><textarea className="input min-h-28" placeholder="Optional notes shown on the invoice" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field></section>
        <section className="card p-5"><h2 className="text-lg font-bold">Summary</h2><div className="mt-4 space-y-3"><Field label="Discount (₹)"><input className="input" type="number" min="0" step="0.01" value={form.discount} onChange={event => setForm({ ...form, discount: Number(event.target.value) })} /></Field><Field label="Tax (₹)"><input className="input" type="number" min="0" step="0.01" value={form.tax} onChange={event => setForm({ ...form, tax: Number(event.target.value) })} /></Field><div className="space-y-2 border-t border-slate-200 pt-3 text-sm"><SummaryRow label="Subtotal" value={inr(subtotal)} /><SummaryRow label="Discount" value={`− ${inr(Number(form.discount || 0))}`} /><SummaryRow label="Tax" value={inr(Number(form.tax || 0))} /><div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold"><span>Total</span><span>{inr(total)}</span></div></div></div></section>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5"><button type="button" className="btn border" onClick={() => router.back()}>Cancel</button><button className="btn border" disabled={saving !== null}>{saving === 'draft' ? 'Saving…' : 'Save draft'}</button><button type="button" className="btn btn-primary" disabled={saving !== null} onClick={() => void save('sent')}>{saving === 'sent' ? 'Saving…' : 'Save & send'}</button></div>
      <p className="text-right text-xs text-slate-500">Save & send marks the invoice as sent. Email delivery is not part of this MVP.</p>
    </form>
  </section>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700"><span>{label}{required && <span className="ml-1 text-rose-600">*</span>}</span><div className="mt-1.5">{children}</div></label>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-slate-600"><span>{label}</span><span>{value}</span></div>;
}
