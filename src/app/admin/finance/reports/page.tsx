'use client';

import { useEffect, useMemo, useState } from 'react';
import { FinanceEmpty, inr } from '@/components/finance-ui';
import { adminRepository } from '@/lib/admin-repository';

function csv(rows: any[]) {
  const quote = (value: any) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return rows.map(row => row.map(quote).join(',')).join('\n');
}

export default function FinanceReports() {
  const [data, setData] = useState<any>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<'all' | 'income' | 'expense' | 'ledger' | 'invoices' | 'payroll'>('all');

  useEffect(() => { void adminRepository.financeReport().then(setData); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    if (type === 'invoices') return data.invoices.map((item: any) => [item.issue_date, item.invoice_number, item.customer_name, item.status, item.finance_invoice_payments?.reduce((total: number, payment: any) => total + Number(payment.amount), 0) || 0]);
    if (type === 'payroll') return data.payroll.map((item: any) => [item.payroll_run?.period_start, item.profile?.full_name, item.payment_status, Number(item.basic_salary) + Number(item.allowances) - Number(item.deductions), item.payment_date || '']);
    return data.transactions.filter((item: any) => (type === 'all' || type === 'ledger' || item.transaction_type === type) && (!from || item.transaction_date >= from) && (!to || item.transaction_date <= to)).map((item: any) => [item.transaction_date, item.transaction_type, item.account?.name, item.income_category?.name || item.expense_category?.name || '', item.counterparty_name || item.description || '', item.amount]);
  }, [data, type, from, to]);

  const total = rows.reduce((sum: number, row: any) => sum + Number(row[row.length - 1] || 0), 0);
  const exportCsv = () => {
    const blob = new Blob([csv([['Date', 'Type', 'Account', 'Category', 'Description', 'Amount'], ...rows])], { type: 'text/csv' });
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = `finance-${type}-report.csv`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return <section className="space-y-4">
    <div className="flex flex-wrap justify-between">
      <div><h1 className="text-2xl font-bold">Finance reports</h1><p className="text-sm text-slate-500">Live reports with CSV and print exports.</p></div>
      <div className="flex gap-2"><button className="btn border" onClick={exportCsv}>Export CSV</button><button className="btn border" onClick={() => window.print()}>Print</button></div>
    </div>
    <div className="card flex flex-wrap gap-2 p-3">
      <select className="input" value={type} onChange={event => setType(event.target.value as any)}>{[['all', 'Profit & loss'], ['income', 'Income report'], ['expense', 'Expense report'], ['ledger', 'Account ledger'], ['invoices', 'Invoice payments'], ['payroll', 'Salary payments']].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <input className="input" type="date" value={from} onChange={event => setFrom(event.target.value)} />
      <input className="input" type="date" value={to} onChange={event => setTo(event.target.value)} />
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      <div className="card p-4"><span className="text-sm text-slate-500">Rows</span><b className="block text-2xl">{rows.length}</b></div>
      <div className="card p-4"><span className="text-sm text-slate-500">Total</span><b className="block text-2xl">{inr(total)}</b></div>
      <div className="card p-4"><span className="text-sm text-slate-500">Period</span><b className="block text-lg">{from || 'All'} – {to || 'All'}</b></div>
    </div>
    <div className="card overflow-x-auto"><table className="min-w-[700px] w-full text-sm"><thead className="bg-slate-50"><tr>{['Date', 'Type', 'Account', 'Category', 'Description', 'Amount'].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row: any, index: number) => <tr className="border-t" key={index}>{row.map((value: any, column: number) => <td className="p-3" key={column}>{column === row.length - 1 ? inr(value) : value || '—'}</td>)}</tr>)}</tbody></table>{!rows.length && <FinanceEmpty>No live records match this report.</FinanceEmpty>}</div>
  </section>;
}
