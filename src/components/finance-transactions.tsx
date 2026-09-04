"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { currentProfile } from "@/lib/auth";
import { adminRepository } from "@/lib/admin-repository";
import { FinanceWorkspaceTabs, inr } from "@/components/finance-ui";
import {
  CompactEmptyState,
  CompactPageHeader,
  DataTableShell,
  ModuleTabs,
  ModuleToolbar,
  Pagination,
  StatusBadge,
} from "@/components/compact-module";
import { financeEntryValidationMessage } from "@/lib/finance-master-data-rules";

export const validateFinanceReceipt = (file: File) =>
  !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
    file.type,
  )
    ? "Upload a PDF, JPG, PNG, or WebP receipt."
    : file.size > 10 * 1024 * 1024
      ? "Receipt must be 10 MB or smaller."
      : null;
const date = () => new Date().toISOString().slice(0, 10);

export function FinanceTransactions({ type }: { type: "income" | "expense" }) {
  const noun = type === "income" ? "Income" : "Expense";
  const categoryKey =
    type === "income" ? "income_category_id" : "expense_category_id";
  const [rows, setRows] = useState<any[]>([]);
  const [options, setOptions] = useState<any>({
    accounts: [],
    income: [],
    expense: [],
  });
  const [profile, setProfile] = useState<any>();
  const [edit, setEdit] = useState<any>();
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [filter, setFilter] = useState({
    search: "",
    account: "",
    category: "",
    from: "",
    to: "",
  });
  const categories = type === "income" ? options.income : options.expense;
  const load = async () => {
    try {
      setLoading(true);
      const [p, o, items] = await Promise.all([
        currentProfile(),
        adminRepository.financeOptions(),
        adminRepository.financeTransactions(type, archived),
      ]);
      setProfile(p);
      setOptions(o);
      setRows(items);
      if (
        !o.accounts.length ||
        !(type === "income" ? o.income : o.expense).length
      )
        setNotice({
          type: "error",
          message: !o.accounts.length
            ? "No active finance accounts found."
            : `No ${noun.toLowerCase()} categories found.`,
        });
    } catch (caught: any) {
      setNotice({
        type: "error",
        message: caught.message || `Could not load finance options. Try again.`,
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [archived]);
  const initial = () => ({
    amount: "",
    transaction_date: date(),
    account_id: options.accounts[0]?.id || "",
    [categoryKey]: categories[0]?.id || "",
    payment_method: "cash",
    counterparty_name: "",
    reference_number: "",
    description: "",
    receipt_path: "",
  });
  const shown = useMemo(
    () =>
      rows.filter((row) => {
        const term = filter.search.toLowerCase();
        const category =
          row[type === "income" ? "income_category" : "expense_category"]
            ?.name || "";
        return (
          (!term ||
            [
              row.counterparty_name,
              row.reference_number,
              row.description,
              category,
            ].some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(term),
            )) &&
          (!filter.account || row.account_id === filter.account) &&
          (!filter.category || row[categoryKey] === filter.category) &&
          (!filter.from || row.transaction_date >= filter.from) &&
          (!filter.to || row.transaction_date <= filter.to)
        );
      }),
    [rows, filter, type, categoryKey],
  );
  const total = shown.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const withReceipt = shown.filter((row) => row.receipt_path).length;
  const visibleRows = shown.slice((page - 1) * pageSize, page * pageSize);
  const resetFilters = () => {
    setFilter({ search: "", account: "", category: "", from: "", to: "" });
    setPage(1);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const validationError = financeEntryValidationMessage({
        amount: edit.amount,
        accountId: edit.account_id,
        categoryId: edit[categoryKey],
      });
      if (validationError) throw new Error(validationError);
      let receipt_path = edit.receipt_path || null;
      if (edit.file) {
        const fileError = validateFinanceReceipt(edit.file);
        if (fileError) throw new Error(fileError);
        receipt_path = await adminRepository.uploadFinanceReceipt(
          profile.id,
          edit.file,
        );
      }
      const payload = {
        ...edit,
        amount: Number(edit.amount),
        receipt_path,
        file: undefined,
      };
      for (const key of [
        "id",
        "account",
        "income_category",
        "expense_category",
        "archived_at",
        "created_at",
        "updated_at",
      ])
        delete payload[key];
      if (edit.id)
        await adminRepository.updateFinanceTransaction(edit.id, payload);
      else
        await adminRepository.createFinanceTransaction({
          ...payload,
          transaction_type: type,
          created_by: profile.id,
        });
      setEdit(null);
      setNotice({ type: "success", message: `${noun} saved successfully.` });
      await load();
    } catch (caught: any) {
      setNotice({
        type: "error",
        message: caught.message || `Could not save ${noun.toLowerCase()}.`,
      });
    } finally {
      setBusy(false);
    }
  };
  const archive = async (row: any) => {
    const action = row.archived_at ? "restore" : "archive";
    if (!window.confirm(`Are you sure you want to ${action} this transaction?`))
      return;
    try {
      if (row.archived_at)
        await adminRepository.restoreFinanceTransaction(row.id);
      else await adminRepository.archiveFinanceTransaction(row.id);
      setNotice({
        type: "success",
        message: `Transaction ${row.archived_at ? "restored" : "archived"}.`,
      });
      await load();
    } catch (caught: any) {
      setNotice({
        type: "error",
        message:
          caught.message || "Transaction status could not be updated.",
      });
    }
  };
  const openReceipt = async (path: string) => {
    try {
      window.open(
        await adminRepository.signedFinanceReceipt(path),
        "_blank",
        "noopener,noreferrer",
      );
    } catch (caught: any) {
      setNotice({
        type: "error",
        message: caught.message || "Receipt could not be opened.",
      });
    }
  };
  return (
    <section className="compact-module finance-transactions-workspace">
      <CompactPageHeader
        title={noun}
        description={`Record, review, and retain receipts for live ${noun.toLowerCase()} transactions.`}
        action={
          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={() => setEdit(initial())}
          >
            Add {noun.toLowerCase()}
          </button>
        }
      />
      <FinanceWorkspaceTabs current={`/admin/finance/${type}`} />
      <div
        className="module-summary-strip finance-summary-strip"
        aria-label={`${noun} summary`}
      >
        <div>
          <span>Filtered total</span>
          <b>{inr(total)}</b>
        </div>
        <div>
          <span>Transactions</span>
          <b>{shown.length}</b>
        </div>
        <div>
          <span>Receipts attached</span>
          <b>{withReceipt}</b>
        </div>
        <div>
          <span>Current view</span>
          <b>{archived ? "Archived" : "Active"}</b>
        </div>
      </div>
      <ModuleTabs
        label={`${noun} record state`}
        value={archived ? "archived" : "active"}
        tabs={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
        onChange={(value) => {
          setArchived(value === "archived");
          setPage(1);
        }}
      />
      <ModuleToolbar>
        <input
          className="input module-search"
          aria-label={`Search ${noun.toLowerCase()} transactions`}
          placeholder="Search description, reference, or counterparty"
          value={filter.search}
          onChange={(event) => {
            setFilter({ ...filter, search: event.target.value });
            setPage(1);
          }}
        />
        <label>
          <span className="sr-only">Account</span>
          <select
            className="input"
            value={filter.account}
            onChange={(event) => {
              setFilter({ ...filter, account: event.target.value });
              setPage(1);
            }}
          >
            <option value="">All accounts</option>
            {options.accounts.map((account: any) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select
            className="input"
            value={filter.category}
            onChange={(event) => {
              setFilter({ ...filter, category: event.target.value });
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((category: any) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">From date</span>
          <input
            className="input"
            aria-label="From date"
            type="date"
            value={filter.from}
            onChange={(event) => {
              setFilter({ ...filter, from: event.target.value });
              setPage(1);
            }}
          />
        </label>
        <label>
          <span className="sr-only">To date</span>
          <input
            className="input"
            aria-label="To date"
            type="date"
            value={filter.to}
            onChange={(event) => {
              setFilter({ ...filter, to: event.target.value });
              setPage(1);
            }}
          />
        </label>
        <button
          className="btn module-reset"
          type="button"
          onClick={resetFilters}
        >
          Reset
        </button>
      </ModuleToolbar>
      {notice && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}
        >
          {notice.message}
          {notice.type === "error" && (
            <button
              className="ml-3 font-semibold underline"
              onClick={() => void load()}
            >
              Retry
            </button>
          )}
        </p>
      )}
      <DataTableShell label={`${noun} transactions`}>
        <table className="module-table finance-transactions-table">
          <thead>
            <tr>
              {[
                "Date",
                "Description / counterparty",
                "Category",
                "Account",
                "Amount",
                "Receipt",
                "Status",
                "Actions",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }, (_, index) => (
                  <tr className="module-skeleton-row" key={index}>
                    <td colSpan={8}>
                      <span />
                    </td>
                  </tr>
                ))
              : visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.transaction_date}</td>
                    <td>
                      <b>
                        {row.description ||
                          row.counterparty_name ||
                          "Untitled transaction"}
                      </b>
                      <small className="block text-slate-500">
                        {row.counterparty_name ||
                          row.reference_number ||
                          "No counterparty or reference"}
                      </small>
                    </td>
                    <td>
                      {row[
                        type === "income"
                          ? "income_category"
                          : "expense_category"
                      ]?.name || "Uncategorised"}
                    </td>
                    <td>{row.account?.name || "—"}</td>
                    <td>
                      <b>{inr(row.amount)}</b>
                    </td>
                    <td>
                      {row.receipt_path ? (
                        <button
                          className="font-medium text-teal-700 hover:underline"
                          onClick={() => void openReceipt(row.receipt_path)}
                        >
                          View receipt
                        </button>
                      ) : (
                        <span className="text-slate-400">Missing</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        status={row.archived_at ? "archived" : "active"}
                      />
                    </td>
                    <td>
                      <button
                        className="font-medium text-teal-700 hover:underline"
                        onClick={() => setEdit({ ...row })}
                      >
                        Edit
                      </button>
                      <button
                        className="ml-3 font-medium text-rose-700 hover:underline"
                        onClick={() => void archive(row)}
                      >
                        {row.archived_at ? "Restore" : "Archive"}
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        <div className="module-mobile-records">
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <span className="module-mobile-skeleton" key={index} />
              ))
            : visibleRows.map((row) => (
                <article key={row.id}>
                  <div>
                    <b>
                      {row.description ||
                        row.counterparty_name ||
                        "Untitled transaction"}
                    </b>
                    <b>{inr(row.amount)}</b>
                  </div>
                  <p>
                    {row.transaction_date} ·{" "}
                    {row[
                      type === "income" ? "income_category" : "expense_category"
                    ]?.name || "Uncategorised"}
                  </p>
                  <small>
                    {row.counterparty_name ||
                      row.account?.name ||
                      "No counterparty"}
                  </small>
                  <button
                    className="module-view"
                    onClick={() => setEdit({ ...row })}
                  >
                    Edit
                  </button>
                </article>
              ))}
        </div>
        {!loading && !shown.length && (
          <CompactEmptyState
            title={`No ${noun.toLowerCase()} transactions`}
            description="No records match the current filters."
          />
        )}
        <Pagination
          page={page}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 50]}
          total={shown.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </DataTableShell>
      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="card max-h-[90vh] w-full max-w-2xl overflow-auto p-6"
            onSubmit={save}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">
                  {edit.id ? "Edit" : `Add ${noun.toLowerCase()}`}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Receipt files: PDF, JPG, PNG, or WebP; maximum 10 MB.
                </p>
              </div>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-950"
                onClick={() => setEdit(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Amount">
                <input
                  required
                  min="0.01"
                  step="0.01"
                  className="input"
                  type="number"
                  value={edit.amount}
                  onChange={(event) =>
                    setEdit({ ...edit, amount: event.target.value })
                  }
                />
              </Field>
              <Field label="Date">
                <input
                  required
                  className="input"
                  type="date"
                  value={edit.transaction_date}
                  onChange={(event) =>
                    setEdit({ ...edit, transaction_date: event.target.value })
                  }
                />
              </Field>
              <Field label="Account">
                <select
                  required
                  className="input"
                  value={edit.account_id}
                  onChange={(event) =>
                    setEdit({ ...edit, account_id: event.target.value })
                  }
                >
                  <option value="">Select an account</option>
                  {options.accounts.map((account: any) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select
                  required
                  className="input"
                  value={edit[categoryKey]}
                  onChange={(event) =>
                    setEdit({ ...edit, [categoryKey]: event.target.value })
                  }
                >
                  <option value="">Select a category</option>
                  {categories.map((category: any) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment method">
                <select
                  className="input"
                  value={edit.payment_method}
                  onChange={(event) =>
                    setEdit({ ...edit, payment_method: event.target.value })
                  }
                >
                  {["cash", "bank_transfer", "upi", "card"].map((method) => (
                    <option key={method}>{method.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </Field>
              <Field label="Counterparty">
                <input
                  className="input"
                  value={edit.counterparty_name || ""}
                  onChange={(event) =>
                    setEdit({ ...edit, counterparty_name: event.target.value })
                  }
                />
              </Field>
              <Field label="Reference">
                <input
                  className="input"
                  value={edit.reference_number || ""}
                  onChange={(event) =>
                    setEdit({ ...edit, reference_number: event.target.value })
                  }
                />
              </Field>
              <Field label="Receipt">
                <input
                  className="input"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setEdit({ ...edit, file: event.target.files?.[0] })
                  }
                />
                {edit.file && (
                  <small className="mt-1 block text-slate-500">
                    {edit.file.name}
                  </small>
                )}
              </Field>
              <Field label="Description" className="md:col-span-2">
                <textarea
                  className="input min-h-24"
                  value={edit.description || ""}
                  onChange={(event) =>
                    setEdit({ ...edit, description: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn border"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button
                disabled={
                  busy ||
                  loading ||
                  !options.accounts.length ||
                  !categories.length
                }
                className="btn btn-primary"
              >
                {busy ? "Saving…" : "Save transaction"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`block text-sm font-semibold text-slate-700 ${className}`}
    >
      <span>{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
