import { executivePeriodRange, isInRange, type ExecutivePeriod } from './executive-dashboard';
import { canonicalExpenseCategory, expenseCategoryOrder } from './expense-categories';

type Transaction = {
  transaction_type: string;
  transaction_date: string;
  amount: number | string;
  expense_category?: { name: string } | null;
};

const incomeTypes = new Set(['income', 'invoice_payment']);
const expenseTypes = new Set(['expense', 'payroll_payment']);

export function buildExecutiveFinanceView(transactions: Transaction[], period: ExecutivePeriod, timeZone: string, now = new Date()) {
  const range = executivePeriodRange(period, now, timeZone);
  const bucketLength = period === 'month' || period === 'previous_month' ? 7 : period === 'quarter' ? 14 : 31;
  return buildExecutiveFinanceViewForRange(transactions, range, bucketLength);
}

export function buildExecutiveFinanceViewForRange(transactions: Transaction[], range: { start: string; end: string }, bucketLength = 7) {
  const rows = transactions.filter(row => isInRange(row.transaction_date, range));
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const boundedBucketLength = Math.max(bucketLength, Math.ceil(dayCount / 12));
  const bucketCount = Math.ceil(dayCount / boundedBucketLength);
  const trend = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start.getTime() + index * boundedBucketLength * 86400000);
    const bucketEnd = new Date(Math.min(end.getTime(), bucketStart.getTime() + (boundedBucketLength - 1) * 86400000));
    const startKey = bucketStart.toISOString().slice(0, 10);
    const endKey = bucketEnd.toISOString().slice(0, 10);
    const inBucket = rows.filter(row => row.transaction_date.slice(0, 10) >= startKey && row.transaction_date.slice(0, 10) <= endKey);
    const income = inBucket.filter(row => incomeTypes.has(row.transaction_type)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenses = inBucket.filter(row => expenseTypes.has(row.transaction_type)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return { label: new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(bucketStart), income, expenses, net: income - expenses };
  });
  let cumulative = 0;
  const netTrend = trend.map(row => ({ label: row.label, net: cumulative += row.net }));
  const income = trend.reduce((sum, row) => sum + row.income, 0);
  const expenses = trend.reduce((sum, row) => sum + row.expenses, 0);
  const categories = new Map<string, number>();
  rows.filter(row => expenseTypes.has(row.transaction_type)).forEach(row => {
    const name = row.transaction_type === 'payroll_payment' ? 'Monthly Expenses' : canonicalExpenseCategory(row.expense_category?.name);
    categories.set(name, (categories.get(name) || 0) + Number(row.amount || 0));
  });
  const breakdown = [...categories].map(([name, value]) => ({ name, value, percent: expenses ? value / expenses * 100 : 0 })).sort((a, b) => {
    const aOrder = expenseCategoryOrder.indexOf(a.name as typeof expenseCategoryOrder[number]);
    const bOrder = expenseCategoryOrder.indexOf(b.name as typeof expenseCategoryOrder[number]);
    return (aOrder < 0 ? expenseCategoryOrder.length : aOrder) - (bOrder < 0 ? expenseCategoryOrder.length : bOrder);
  });
  return { range, income, expenses, net: income - expenses, margin: income ? (income - expenses) / income * 100 : null, trend, netTrend, breakdown };
}
