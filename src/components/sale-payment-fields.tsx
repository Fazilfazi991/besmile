import { conversionBalance, type ConversionPaymentInput } from '@/lib/conversion-payment';

type Account = { id: string; name: string; account_type?: string };

export function SalePaymentFields({
  value,
  onChange,
  accounts,
  canRecordPayment,
  closingDate,
}: {
  value: ConversionPaymentInput;
  onChange: (patch: Partial<ConversionPaymentInput>) => void;
  accounts: Account[];
  canRecordPayment: boolean;
  closingDate: string;
}) {
  const received = Number(value.payment_received || 0);
  const balance = conversionBalance(value.sale_value, value.payment_received);
  return <>
    <label className="text-sm font-semibold text-slate-700">Sale amount *
      <input required className="input mt-1" type="number" min="0" step="0.01" value={value.sale_value} onChange={event => onChange({ sale_value: event.target.value })} />
    </label>
    <label className="text-sm font-semibold text-slate-700">Payment received
      <input className="input mt-1" type="number" min="0" max={value.sale_value || undefined} step="0.01" value={value.payment_received} disabled={!canRecordPayment} onChange={event => onChange({ payment_received: event.target.value })} />
      {!canRecordPayment && <span className="mt-1 block text-xs font-normal text-slate-500">Only an authorized Finance or invoice manager can record money received.</span>}
    </label>
    <label className="text-sm font-semibold text-slate-700">Balance due
      <output className="input mt-1 block bg-slate-50" aria-live="polite">INR {balance.toFixed(2)}</output>
    </label>
    {balance > 0 && <label className="text-sm font-semibold text-slate-700">Invoice due date *
      <input required className="input mt-1" type="date" min={closingDate} value={value.invoice_due_date} onChange={event => onChange({ invoice_due_date: event.target.value })} />
    </label>}
    {canRecordPayment && received > 0 && <div className="grid gap-3 sm:grid-cols-2 sm:col-span-2">
      <label className="text-sm font-semibold text-slate-700">Receiving account *
        <select required className="input mt-1" value={value.receiving_account} onChange={event => onChange({ receiving_account: event.target.value })}>
          <option value="">Select account</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">Payment method *
        <select required className="input mt-1" value={value.payment_method} onChange={event => onChange({ payment_method: event.target.value })}>
          <option value="">Select method</option>
          {['cash', 'bank_transfer', 'upi', 'card'].map(method => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">Payment date *
        <input required className="input mt-1" type="date" value={value.payment_date} onChange={event => onChange({ payment_date: event.target.value })} />
      </label>
      <label className="text-sm font-semibold text-slate-700">Payment reference
        <input className="input mt-1" value={value.payment_reference} onChange={event => onChange({ payment_reference: event.target.value })} />
      </label>
    </div>}
  </>;
}
