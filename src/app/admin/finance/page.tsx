"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CompactEmptyState,
  CompactPageHeader,
  DataTableShell,
  Pagination,
  StatusBadge,
} from "@/components/compact-module";
import { FinanceWorkspaceTabs, inr } from "@/components/finance-ui";
import { EmployeeLoading } from "@/components/employee-ui";
import { adminRepository } from "@/lib/admin-repository";

const overviewPageSize = 6;
const transactionHref = (type: string) => {
  if (type === "expense") return "/admin/finance/expenses";
  if (type === "invoice_payment") return "/admin/finance/invoices";
  if (type === "payroll_payment") return "/admin/finance/payroll";
  if (type === "psychologist_payment")
    return "/admin/finance/psychologist-payments";
  return "/admin/finance/income";
};

export default function FinancePage() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    void adminRepository
      .financeDashboard()
      .then(setData)
      .catch((caught: any) =>
        setError(caught.message || "Finance data could not be loaded."),
      );
  }, []);
  const trend = useMemo(() => {
    const buckets = new Map<string, { income: number; expense: number }>();
    for (const row of data?.monthly || []) {
      const key = String(row.transaction_date || "").slice(0, 7);
      const bucket = buckets.get(key) || { income: 0, expense: 0 };
      if (["income", "invoice_payment"].includes(row.transaction_type))
        bucket.income += Number(row.amount || 0);
      else if (["expense", "payroll_payment"].includes(row.transaction_type))
        bucket.expense += Number(row.amount || 0);
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].slice(-6);
  }, [data]);
  if (error)
    return (
      <section className="compact-module finance-overview-workspace">
        <div className="module-alert module-alert-error">{error}</div>
      </section>
    );
  if (!data) return <EmployeeLoading cards={4} />;
  const recent = data.recent || [];
  const visibleRows = recent.slice(
    (page - 1) * overviewPageSize,
    page * overviewPageSize,
  );
  const latestPeriod = trend.at(-1)?.[0];
  const openInvoices = Number(data.outstanding || 0);
  const attentionCount =
    openInvoices + (Number(data.salariesPending || 0) > 0 ? 1 : 0);
  const maxTrend = Math.max(
    1,
    ...trend.flatMap(([, value]) => [value.income, value.expense]),
  );

  return (
    <section className="compact-module finance-overview-workspace">
      <CompactPageHeader
        title="Finance & accounts"
        description="Live balances, collections, spending, payroll, and recent ledger activity."
        action={
          <Link className="btn btn-primary" href="/admin/finance/invoices/new">
            Create invoice
          </Link>
        }
      />
      <FinanceWorkspaceTabs current="/admin/finance" />
      <div
        className="module-summary-strip finance-summary-strip"
        aria-label="Financial summary"
      >
        <div>
          <span>Cash / bank</span>
          <b>{inr(data.balance)}</b>
        </div>
        <div>
          <span>Income</span>
          <b className="finance-positive">{inr(data.income)}</b>
        </div>
        <div>
          <span>Expenses</span>
          <b className="finance-negative">{inr(data.expenses)}</b>
        </div>
        <div>
          <span>Net position</span>
          <b
            className={data.net >= 0 ? "finance-positive" : "finance-negative"}
          >
            {inr(data.net)}
          </b>
        </div>
        <div>
          <span>Outstanding</span>
          <b>{inr(data.outstandingAmount)}</b>
        </div>
      </div>
      <div className="finance-overview-grid">
        <section
          className="finance-trend-panel"
          aria-label="Income and expense trend"
        >
          <header>
            <div>
              <h2>Income vs expenses</h2>
              <p>
                {latestPeriod
                  ? `Latest 6 ledger months · through ${latestPeriod}`
                  : "Ledger month comparison"}
              </p>
            </div>
            <Link href="/admin/finance/reports">View reports</Link>
          </header>
          {trend.length ? (
            <div className="finance-trend-bars">
              {trend.map(([month, values]) => (
                <div className="finance-trend-month" key={month}>
                  <span>{month}</span>
                  <div title={`Income ${inr(values.income)}`}>
                    <i
                      className="income"
                      style={{
                        width: `${Math.max(3, (values.income / maxTrend) * 100)}%`,
                      }}
                    />
                  </div>
                  <div title={`Expenses ${inr(values.expense)}`}>
                    <i
                      className="expense"
                      style={{
                        width: `${Math.max(3, (values.expense / maxTrend) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CompactEmptyState
              title="No ledger trend yet"
              description="Income and expense activity will appear here once recorded."
            />
          )}
        </section>
        <section className="finance-attention-panel">
          <header>
            <div>
              <h2>Needs attention</h2>
              <p>
                {attentionCount
                  ? `${attentionCount} financial workflow${attentionCount === 1 ? "" : "s"} to review`
                  : "No pending financial workflows"}
              </p>
            </div>
          </header>
          <Link href="/admin/finance/invoices">
            <span>Open invoices</span>
            <b>{openInvoices}</b>
            <small>{inr(data.outstandingAmount)} outstanding</small>
          </Link>
          <Link href="/admin/finance/payroll">
            <span>Pending payroll</span>
            <b>{inr(data.salariesPending)}</b>
            <small>Open payroll workspace</small>
          </Link>
        </section>
      </div>
      <section className="finance-ledger-section">
        <header>
          <div>
            <h2>Recent transactions</h2>
            <p>Latest activity across active finance accounts.</p>
          </div>
          <div>
            <Link href="/admin/finance/income">Add income</Link>
            <Link href="/admin/finance/expenses">Add expense</Link>
          </div>
        </header>
        <DataTableShell label="Recent finance transactions">
          <table className="module-table finance-overview-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction</th>
                <th>Account</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row: any) => (
                <tr key={row.id}>
                  <td>{row.transaction_date}</td>
                  <td>
                    <b>
                      {row.description ||
                        String(row.transaction_type || "").replaceAll("_", " ")}
                    </b>
                    <small>
                      {String(row.transaction_type || "").replaceAll("_", " ")}
                    </small>
                  </td>
                  <td>{row.account?.name || "Account unavailable"}</td>
                  <td>
                    <StatusBadge status="active" />
                  </td>
                  <td
                    className={
                      [
                        "expense",
                        "payroll_payment",
                        "psychologist_payment",
                      ].includes(row.transaction_type)
                        ? "finance-negative"
                        : "finance-positive"
                    }
                  >
                    <b>{inr(row.amount)}</b>
                  </td>
                  <td>
                    <Link
                      className="module-view"
                      href={transactionHref(row.transaction_type)}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="module-mobile-records">
            {visibleRows.map((row: any) => (
              <article key={row.id}>
                <div>
                  <b>
                    {row.description ||
                      String(row.transaction_type || "").replaceAll("_", " ")}
                  </b>
                  <b
                    className={
                      [
                        "expense",
                        "payroll_payment",
                        "psychologist_payment",
                      ].includes(row.transaction_type)
                        ? "finance-negative"
                        : "finance-positive"
                    }
                  >
                    {inr(row.amount)}
                  </b>
                </div>
                <p>
                  {row.transaction_date} ·{" "}
                  {row.account?.name || "Account unavailable"}
                </p>
                <small>
                  {String(row.transaction_type || "").replaceAll("_", " ")}
                </small>
                <Link
                  className="module-view"
                  href={transactionHref(row.transaction_type)}
                >
                  Open
                </Link>
              </article>
            ))}
          </div>
          {!recent.length && (
            <CompactEmptyState
              title="No transactions yet"
              description="Recorded income and expenses will appear here."
            />
          )}
          <Pagination
            page={page}
            pageSize={overviewPageSize}
            total={recent.length}
            onPageChange={setPage}
          />
        </DataTableShell>
      </section>
    </section>
  );
}
