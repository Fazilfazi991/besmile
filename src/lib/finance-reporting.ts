import { canonicalExpenseCategoryNames } from "./finance-expense-categories";

export type FinanceReportKind =
  | "income"
  | "capital_expense"
  | "monthly_expense"
  | "maintenance"
  | "profit_loss";
export type FinanceReportTransaction = {
  id: string;
  transaction_type: string;
  transaction_date: string;
  amount: number | string;
  reference_number?: string | null;
  description?: string | null;
  counterparty_name?: string | null;
  payment_method?: string | null;
  account?: { name?: string | null } | null;
  income_category?: { name?: string | null } | null;
  expense_category?: { name?: string | null } | null;
  archived_at?: string | null;
};

export const reportPageSize = 20;
export const financeReportLabels: Record<FinanceReportKind, string> = {
  income: "Income report",
  capital_expense: "Capital Expense report",
  monthly_expense: "Monthly Expense report",
  maintenance: "Maintenance report",
  profit_loss: "Profit & loss",
};

const legacyExpenseCategories: Record<
  string,
  (typeof canonicalExpenseCategoryNames)[number]
> = {
  salary: "Monthly Expense",
  rent: "Monthly Expense",
  utilities: "Monthly Expense",
  marketing: "Monthly Expense",
  advertising: "Monthly Expense",
  "meta ads": "Monthly Expense",
  "google ads": "Monthly Expense",
  website: "Monthly Expense",
  hosting: "Monthly Expense",
  software: "Monthly Expense",
  saas: "Monthly Expense",
  internet: "Monthly Expense",
  office: "Monthly Expense",
  "office supplies": "Monthly Expense",
  travel: "Monthly Expense",
  "psychologist session payout": "Monthly Expense",
  capital: "Capital Expense",
  "equipment purchase": "Capital Expense",
  equipment: "Capital Expense",
  furniture: "Capital Expense",
  "office setup": "Capital Expense",
  laptop: "Capital Expense",
  computer: "Capital Expense",
  asset: "Capital Expense",
  assets: "Capital Expense",
  maintenance: "Maintenance",
  repair: "Maintenance",
  repairs: "Maintenance",
  "website maintenance": "Maintenance",
  "laptop servicing": "Maintenance",
  "equipment repair": "Maintenance",
  "technical maintenance": "Maintenance",
};

export const canonicalExpenseCategory = (name?: string | null) => {
  if (!name) return null;
  if ((canonicalExpenseCategoryNames as readonly string[]).includes(name))
    return name as (typeof canonicalExpenseCategoryNames)[number];
  return legacyExpenseCategories[name.trim().toLowerCase()] || null;
};

export const isIncomeTransaction = (transaction: FinanceReportTransaction) =>
  ["income", "invoice_payment"].includes(transaction.transaction_type);
export const isInRange = (
  transaction: FinanceReportTransaction,
  from: string,
  to: string,
) =>
  !transaction.archived_at &&
  (!from || transaction.transaction_date >= from) &&
  (!to || transaction.transaction_date <= to);
export const filteredFinanceTransactions = (
  transactions: FinanceReportTransaction[],
  from: string,
  to: string,
) => transactions.filter((transaction) => isInRange(transaction, from, to));
export const reportTransactions = (
  transactions: FinanceReportTransaction[],
  kind: FinanceReportKind,
  from: string,
  to: string,
) => {
  const filtered = filteredFinanceTransactions(transactions, from, to);
  if (kind === "income") return filtered.filter(isIncomeTransaction);
  if (kind === "profit_loss") return filtered;
  const category =
    kind === "capital_expense"
      ? "Capital Expense"
      : kind === "monthly_expense"
        ? "Monthly Expense"
        : "Maintenance";
  return filtered.filter(
    (transaction) =>
      canonicalExpenseCategory(transaction.expense_category?.name) === category,
  );
};

export const financeReportSummary = (
  transactions: FinanceReportTransaction[],
  from: string,
  to: string,
) => {
  const filtered = filteredFinanceTransactions(transactions, from, to);
  const sum = (rows: FinanceReportTransaction[]) =>
    rows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const income = sum(filtered.filter(isIncomeTransaction));
  const capitalExpense = sum(
    filtered.filter(
      (row) =>
        canonicalExpenseCategory(row.expense_category?.name) ===
        "Capital Expense",
    ),
  );
  const monthlyExpense = sum(
    filtered.filter(
      (row) =>
        canonicalExpenseCategory(row.expense_category?.name) ===
        "Monthly Expense",
    ),
  );
  const maintenance = sum(
    filtered.filter(
      (row) =>
        canonicalExpenseCategory(row.expense_category?.name) === "Maintenance",
    ),
  );
  const totalExpenses = capitalExpense + monthlyExpense + maintenance;
  return {
    income,
    capitalExpense,
    monthlyExpense,
    maintenance,
    totalExpenses,
    net: income - totalExpenses,
  };
};

export const financeReportFilename = (
  kind: Exclude<FinanceReportKind, "profit_loss">,
  from: string,
  to: string,
) => {
  const prefix = kind.replace("_", "-");
  const period =
    from && to && from.slice(0, 7) === to.slice(0, 7)
      ? from.slice(0, 7)
      : from || to || "all-dates";
  return `${prefix}-report-${period}.csv`;
};

export const financeReportCsvRows = (
  transactions: FinanceReportTransaction[],
) =>
  transactions.map((transaction) => ({
    Date: transaction.transaction_date,
    Origin: transaction.transaction_type.replaceAll("_", " "),
    Account: transaction.account?.name || "",
    Category: isIncomeTransaction(transaction)
      ? transaction.income_category?.name || ""
      : transaction.expense_category?.name || "Legacy / uncategorized",
    Reference: transaction.reference_number || "",
    Description: transaction.description || transaction.counterparty_name || "",
    "Payment method": transaction.payment_method || "",
    Amount: Number(transaction.amount || 0),
  }));
