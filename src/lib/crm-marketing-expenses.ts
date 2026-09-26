export function marketingExpenseTotal(rows: { amount: number | string; transaction_date: string; transaction_type: string; expense_category?: { name: string } | null; archived_at?: string | null }[], range: { start: string; end: string }) {
  return rows.filter(row => row.transaction_type === 'expense'
    && row.expense_category?.name === 'Marketing'
    && !row.archived_at
    && row.transaction_date >= range.start
    && row.transaction_date <= range.end)
    .reduce((total, row) => total + Number(row.amount || 0), 0);
}

export function crmFinanceDisplay(revenue: number, allExpenses: number, marketingExpenses: number | null) {
  return {
    revenue,
    marketingExpenses,
    netResult: revenue - allExpenses,
    bars: [
      { label: 'Revenue', value: revenue, tone: 'bg-teal-600' },
      { label: 'Marketing Expenses', value: marketingExpenses, tone: 'bg-rose-400' },
      { label: 'Net', value: revenue - allExpenses, tone: 'bg-slate-700' },
    ],
  };
}
