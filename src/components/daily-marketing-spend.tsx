'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { currentCrmBusinessDate } from '@/lib/crm-dashboard-e1';
import { marketingSubtypes } from '@/lib/daily-marketing-spend';
import { dailyMarketingSpendRepository, type DailySpendOptions } from '@/lib/daily-marketing-spend-repository';

const emptyFields = { amount: '', method: '', details: '', reference: '' };

export function DailyMarketingSpendEntry({ onSaved }: { onSaved?: () => void }) {
  const [allowed, setAllowed] = useState(false);
  const [date, setDate] = useState(currentCrmBusinessDate);
  const [subtype, setSubtype] = useState<string>('Performance Marketing Expenses');
  const [account, setAccount] = useState('');
  const [options, setOptions] = useState<DailySpendOptions>({ accounts: [], entries: [] });
  const [draft, setDraft] = useState({ key: '', fields: emptyFields });
  const [loadedDate, setLoadedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    void dailyMarketingSpendRepository.allowed().then(value => { if (active) setAllowed(value); })
      .catch(() => { if (active) setError('Spend entry access could not be verified. Reload to retry.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void dailyMarketingSpendRepository.options(date).then(value => {
      if (!active) return;
      setOptions(value); setLoadedDate(date); setError('');
    }).catch(() => { if (active) { setLoadedDate(''); setError('Daily totals could not be loaded. Retry before entering spend.'); } });
    return () => { active = false; };
  }, [allowed, date, retry]);

  const entry = options.entries.find(row => row.account_id === account && row.expense_subcategory === subtype);
  const formKey = [date, account, subtype, entry?.updated_at || '', loadedDate].join(':');
  const fields = draft.key === formKey ? draft.fields : entry ? { amount: String(entry.amount), method: entry.payment_method, details: entry.description || '', reference: entry.reference_number || '' } : emptyFields;
  const setFields = (value: typeof emptyFields) => setDraft({ key: formKey, fields: value });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || loadedDate !== date) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await dailyMarketingSpendRepository.save({ business_date: date, spend_amount: Number(fields.amount), subtype,
        finance_account: account, method: fields.method, details: fields.details, reference: fields.reference,
        expected_updated_at: entry?.updated_at || null });
      setMessage('Daily Marketing spend saved in Finance.');
      setLoadedDate(''); setRetry(value => value + 1); onSaved?.();
    } catch (caught) {
      setError(caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Spend could not be saved. Retry or reload the daily total.');
    } finally { lock.current = false; setBusy(false); }
  }

  if (!allowed) return error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null;
  return <section className="card min-w-0 p-4" aria-label="Daily Marketing spend entry">
    <h2 className="font-bold">Daily Marketing spend</h2>
    <p className="mt-1 text-sm text-slate-600">Enter the daily total for this subtype and account. Saving updates the same expense in Finance. Business dates use India time.</p>
    <form className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={event => void save(event)}>
      <label>Business date<input className="input w-full" type="date" required max={currentCrmBusinessDate()} value={date} disabled={busy} onChange={event => { setDate(event.target.value); setMessage(''); }} /></label>
      <label>Marketing subtype<select className="input w-full" value={subtype} disabled={busy} onChange={event => { setSubtype(event.target.value); setMessage(''); }}>{marketingSubtypes.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Finance account<select className="input w-full" required value={account} disabled={busy || loadedDate !== date} onChange={event => { setAccount(event.target.value); setMessage(''); }}><option value="">Select account</option>{options.accounts.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label>Amount spent (₹)<input className="input w-full" required type="number" min="0.01" max="999999999999.99" step="0.01" value={fields.amount} disabled={busy || loadedDate !== date} onChange={event => setFields({ ...fields, amount: event.target.value })} /></label>
      <label>Payment method<select className="input w-full" required value={fields.method} disabled={busy} onChange={event => setFields({ ...fields, method: event.target.value })}><option value="">Select method</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="card">Card</option></select></label>
      <label>Reference (optional)<input className="input w-full" value={fields.reference} disabled={busy} onChange={event => setFields({ ...fields, reference: event.target.value })} /></label>
      <label className="sm:col-span-2">Description {subtype === 'Other Marketing Expenses' ? '(required)' : '(optional)'}<input className="input w-full" required={subtype === 'Other Marketing Expenses'} value={fields.details} disabled={busy} onChange={event => setFields({ ...fields, details: event.target.value })} /></label>
      <div className="flex flex-wrap items-end gap-2"><button className="btn btn-primary" disabled={busy || loadedDate !== date || !!entry?.archived_at}>{busy ? 'Saving…' : entry ? 'Update Daily Spend' : 'Save Daily Spend'}</button><button className="btn border" type="button" disabled={busy} onClick={() => { setLoadedDate(''); setRetry(value => value + 1); }}>Reload total</button></div>
    </form>
    {entry?.archived_at && <p className="mt-3 text-sm">This total is archived. Review it in Finance before editing.</p>}
    {message && <p className="mt-3 text-emerald-800" role="status">{message}</p>}
    {error && <p className="mt-3 text-rose-700" role="alert">{error}</p>}
  </section>;
}
