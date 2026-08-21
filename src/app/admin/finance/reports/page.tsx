"use client";

import { useEffect, useMemo, useState } from "react";
import { FinanceEmpty, inr } from "@/components/finance-ui";
import { adminRepository } from "@/lib/admin-repository";
import { downloadReportCsv } from "@/lib/report-export";
import {
  financeReportCsvRows,
  financeReportFilename,
  financeReportLabels,
  financeReportSummary,
  FinanceReportKind,
  FinanceReportTransaction,
  reportPageSize,
  reportTransactions,
} from "@/lib/finance-reporting";

const csvHeaders = [
  "Date",
  "Origin",
  "Account",
  "Category",
  "Reference",
  "Description",
  "Payment method",
  "Amount",
];
const today = () => new Date().toISOString().slice(0, 10);
const startOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
const previousMonth = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  const value = date.toISOString().slice(0, 10);
  return {
    from: startOfMonth(value),
    to: `${value.slice(0, 7)}-${new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0).getDate().toString().padStart(2, "0")}`,
  };
};

export default function FinanceReports() {
  const [transactions, setTransactions] = useState<FinanceReportTransaction[]>(
    [],
  );
  const [kind, setKind] = useState<FinanceReportKind>("income");
  const [from, setFrom] = useState(startOfMonth(today()));
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);

  useEffect(() => {
    void adminRepository
      .financeReport()
      .then((data) => setTransactions(data.transactions))
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load finance reports.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => setPage(1), [kind, from, to]);
  const summary = useMemo(
    () => financeReportSummary(transactions, from, to),
    [transactions, from, to],
  );
  const rows = useMemo(
    () => reportTransactions(transactions, kind, from, to),
    [transactions, kind, from, to],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / reportPageSize));
  const visibleRows = rows.slice(
    (page - 1) * reportPageSize,
    page * reportPageSize,
  );
  const exportCsv = async () => {
    if (kind === "profit_loss" || csvBusy) return;
    setCsvBusy(true);
    setError("");
    try {
      await downloadReportCsv(
        financeReportFilename(kind, from, to),
        csvHeaders,
        financeReportCsvRows(rows),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to generate CSV.",
      );
    } finally {
      setCsvBusy(false);
    }
  };
  const setPeriod = (period: "current" | "previous") => {
    if (period === "current") {
      setFrom(startOfMonth(today()));
      setTo(today());
      return;
    }
    const value = previousMonth();
    setFrom(value.from);
    setTo(value.to);
  };

  return (
    <section className="mx-auto max-w-[1320px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Finance</p>
          <h1 className="text-2xl font-bold">Finance reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review live ledger activity by income and expense category.
          </p>
        </div>
        {kind !== "profit_loss" && (
          <button
            className="btn border"
            disabled={csvBusy || loading}
            onClick={() => void exportCsv()}
          >
            {csvBusy ? "Generating CSV…" : "Download CSV"}
          </button>
        )}
      </div>
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="card grid gap-3 p-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_minmax(155px,1fr)_minmax(155px,1fr)]">
        <select
          aria-label="Finance report"
          className="input"
          value={kind}
          onChange={(event) => setKind(event.target.value as FinanceReportKind)}
        >
          {(Object.keys(financeReportLabels) as FinanceReportKind[]).map(
            (value) => (
              <option key={value} value={value}>
                {financeReportLabels[value]}
              </option>
            ),
          )}
        </select>
        <button className="btn border" onClick={() => setPeriod("current")}>
          Current month
        </button>
        <button className="btn border" onClick={() => setPeriod("previous")}>
          Previous month
        </button>
        <input
          aria-label="Report start date"
          className="input"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <input
          aria-label="Report end date"
          className="input"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Total income" value={summary.income} />
        <Metric label="Capital Expense" value={summary.capitalExpense} />
        <Metric label="Monthly Expense" value={summary.monthlyExpense} />
        <Metric label="Maintenance" value={summary.maintenance} />
        <Metric label="Total expenses" value={summary.totalExpenses} />
        <Metric
          label="Net"
          value={summary.net}
          tone={summary.net < 0 ? "text-rose-700" : "text-emerald-700"}
        />
      </div>
      <div className="card min-w-0 max-w-full overflow-x-auto">
        <table className="min-w-[860px] w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {csvHeaders.map((header) => (
                <th className="px-4 py-3 text-left" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className="border-t border-slate-100" key={row.id}>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.transaction_date}
                </td>
                <td className="px-4 py-3 capitalize">
                  {row.transaction_type.replaceAll("_", " ")}
                </td>
                <td className="px-4 py-3">{row.account?.name || "—"}</td>
                <td className="px-4 py-3">
                  {row.income_category?.name ||
                    row.expense_category?.name ||
                    "Legacy / uncategorized"}
                </td>
                <td className="px-4 py-3">{row.reference_number || "—"}</td>
                <td className="px-4 py-3">
                  {row.description || row.counterparty_name || "—"}
                </td>
                <td className="px-4 py-3 capitalize">
                  {row.payment_method?.replaceAll("_", " ") || "—"}
                </td>
                <td className="px-4 py-3 font-bold">{inr(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !rows.length && (
          <FinanceEmpty>No live records match this report period.</FinanceEmpty>
        )}
      </div>
      {rows.length > reportPageSize && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * reportPageSize + 1}–
            {Math.min(page * reportPageSize, rows.length)} of {rows.length}{" "}
            rows. CSV exports all filtered rows.
          </p>
          <div className="flex gap-2">
            <button
              className="btn border"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              className="btn border"
              disabled={page === pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{inr(value)}</p>
    </div>
  );
}
