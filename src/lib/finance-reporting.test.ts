import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  financeReportCsvRows,
  financeReportSummary,
  filteredFinanceTransactions,
  reportPageSize,
  reportTransactions,
} from "./finance-reporting";
import { reportCsv } from "./report-export";

const rows: any[] = [
  {
    id: "income",
    transaction_type: "income",
    transaction_date: "2026-08-03",
    amount: 1000,
    income_category: { name: "Service" },
  },
  {
    id: "invoice",
    transaction_type: "invoice_payment",
    transaction_date: "2026-08-04",
    amount: 500,
    income_category: { name: "Session" },
  },
  {
    id: "capital",
    transaction_type: "expense",
    transaction_date: "2026-08-05",
    amount: 700,
    expense_category: { name: "Capital Expense" },
  },
  {
    id: "salary",
    transaction_type: "payroll_payment",
    transaction_date: "2026-08-06",
    amount: 300,
    expense_category: { name: "Monthly Expense" },
  },
  {
    id: "psychologist",
    transaction_type: "psychologist_payment",
    transaction_date: "2026-08-07",
    amount: 200,
    expense_category: { name: "Monthly Expense" },
  },
  {
    id: "maintenance",
    transaction_type: "expense",
    transaction_date: "2026-08-08",
    amount: 100,
    expense_category: { name: "Maintenance" },
  },
  {
    id: "legacy",
    transaction_type: "expense",
    transaction_date: "2026-08-09",
    amount: 50,
    expense_category: { name: "Marketing" },
  },
  {
    id: "ambiguous",
    transaction_type: "expense",
    transaction_date: "2026-08-10",
    amount: 10,
    expense_category: { name: "Other" },
  },
];
const reportPage = readFileSync(
  resolve(process.cwd(), "src/app/admin/finance/reports/page.tsx"),
  "utf8",
);
const permissionAccess = readFileSync(
  resolve(process.cwd(), "src/lib/permission-access.ts"),
  "utf8",
);

describe("finance reporting", () => {
  it("uses the finance ledger as the single source and separates reports by category", () => {
    expect(
      reportTransactions(rows, "income", "2026-08-01", "2026-08-31").map(
        (row) => row.id,
      ),
    ).toEqual(["income", "invoice"]);
    expect(
      reportTransactions(rows, "capital_expense", "", "").map((row) => row.id),
    ).toEqual(["capital"]);
    expect(
      reportTransactions(rows, "monthly_expense", "", "").map((row) => row.id),
    ).toEqual(["salary", "psychologist", "legacy"]);
    expect(
      reportTransactions(rows, "maintenance", "", "").map((row) => row.id),
    ).toEqual(["maintenance"]);
  });

  it("preserves salary and psychologist origins without duplicate transactions", () => {
    const monthly = reportTransactions(rows, "monthly_expense", "", "");
    expect(
      monthly.filter((row) => row.transaction_type === "payroll_payment"),
    ).toHaveLength(1);
    expect(
      monthly.filter((row) => row.transaction_type === "psychologist_payment"),
    ).toHaveLength(1);
  });

  it("keeps invoice received income in the income report and applies filters to totals and rows", () => {
    expect(
      filteredFinanceTransactions(rows, "2026-08-04", "2026-08-07").map(
        (row) => row.id,
      ),
    ).toEqual(["invoice", "capital", "salary", "psychologist"]);
    expect(financeReportSummary(rows, "2026-08-01", "2026-08-31")).toEqual({
      income: 1500,
      capitalExpense: 700,
      monthlyExpense: 550,
      maintenance: 100,
      totalExpenses: 1350,
      net: 150,
    });
  });

  it("exports the complete filtered dataset rather than the paginated subset", () => {
    expect(reportPageSize).toBe(20);
    const exportRows = financeReportCsvRows(
      Array.from({ length: 21 }, (_, index) => ({
        ...rows[0],
        id: String(index),
        transaction_date: "2026-08-01",
      })),
    );
    expect(
      reportCsv(Object.keys(exportRows[0]), exportRows).split("\r\n"),
    ).toHaveLength(22);
  });

  it("keeps ambiguous historical categories readable without counting them as a new category", () => {
    expect(financeReportCsvRows([rows[7]])[0].Category).toBe("Other");
    expect(financeReportSummary([rows[7]], "", "").totalExpenses).toBe(0);
  });

  it("keeps the existing report permission and contains wide tables on mobile", () => {
    expect(permissionAccess).toContain(
      "if (path.startsWith('/admin/finance/reports')) return anyOf('reports.finance.view', 'reports.view');",
    );
    expect(reportPage).toContain("min-w-0 max-w-full overflow-x-auto");
    expect(reportPage).toContain("reportPageSize");
  });
});
