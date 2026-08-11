"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminRepository } from "@/lib/admin-repository";
import { supabase } from "@/lib/supabase";
import { inr } from "@/components/finance-ui";

type Period = "today" | "week" | "month";
const businessDate = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const dateFor = (value: unknown) => String(value || "").slice(0, 10);
function periodRange(period: Period) {
  const end = businessDate();
  const start = new Date(`${end}T00:00:00Z`);
  if (period === "week")
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (period === "month") start.setUTCDate(1);
  return { start: start.toISOString().slice(0, 10), end };
}
function inPeriod(value: unknown, range: { start: string; end: string }) {
  const date = dateFor(value);
  return date >= range.start && date <= range.end;
}
const palette = [
  "#0f766e",
  "#14b8a6",
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#f43f5e",
  "#64748b",
];

export default function CrmDashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [leads, setLeads] = useState<any[]>([]);
  const [lookups, setLookups] = useState<any>({ sources: [], statuses: [] });
  const [financial, setFinancial] = useState<any>(null);
  const [financeAllowed, setFinanceAllowed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const permission = await supabase?.rpc("has_permission", {
          permission_code: "finance.dashboard.view",
        });
        const canFinance =
          permission?.data === true ||
          (
            await supabase?.rpc("has_permission", {
              permission_code: "finance.view",
            })
          )?.data === true;
        const [leadRows, options, finance] = await Promise.all([
          adminRepository.crmLeads(),
          adminRepository.crmLookups(),
          canFinance
            ? adminRepository.financeDashboard()
            : Promise.resolve(null),
        ]);
        if (!active) return;
        setLeads(leadRows || []);
        setLookups(options);
        setFinanceAllowed(canFinance);
        setFinancial(finance);
      } catch (caught: any) {
        if (active)
          setError(caught.message || "CRM dashboard data could not be loaded.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const range = useMemo(() => periodRange(period), [period]);
  const data = useMemo(() => {
    const periodLeads = leads.filter((lead) =>
      inPeriod(lead.lead_date || lead.created_at, range),
    );
    const converted = leads.filter(
      (lead) => lead.converted_at && inPeriod(lead.converted_at, range),
    );
    const followups = leads.flatMap((lead) =>
      (lead.crm_lead_followups || []).map((item: any) => ({ ...item, lead })),
    );
    const now = businessDate();
    const due = followups.filter(
      (item) => dateFor(item.next_follow_up_at) === now && !item.outcome,
    );
    const overdue = followups.filter(
      (item) =>
        item.next_follow_up_at &&
        dateFor(item.next_follow_up_at) < now &&
        !item.outcome,
    );
    const upcoming = followups.filter(
      (item) =>
        item.next_follow_up_at &&
        dateFor(item.next_follow_up_at) > now &&
        !item.outcome,
    );
    const completed = followups.filter(
      (item) => item.outcome && inPeriod(item.created_at, range),
    );
    const sales = leads
      .flatMap((lead) => lead.crm_sales || [])
      .filter((sale) => inPeriod(sale.closing_date, range));
    const daily = new Map<string, { leads: number; converted: number }>();
    periodLeads.forEach((lead) => {
      const key = dateFor(lead.lead_date || lead.created_at);
      daily.set(key, {
        ...(daily.get(key) || { leads: 0, converted: 0 }),
        leads: (daily.get(key)?.leads || 0) + 1,
      });
    });
    converted.forEach((lead) => {
      const key = dateFor(lead.converted_at);
      daily.set(key, {
        ...(daily.get(key) || { leads: 0, converted: 0 }),
        converted: (daily.get(key)?.converted || 0) + 1,
      });
    });
    return {
      periodLeads,
      converted,
      followups: { due, overdue, upcoming, completed },
      sales,
      daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [leads, range]);
  const statusRows = lookups.statuses
    .map((item: any) => ({
      name: item.name,
      count: data.periodLeads.filter((lead) => lead.status_id === item.id)
        .length,
    }))
    .filter((item: any) => item.count);
  const sourceRows = lookups.sources
    .map((item: any) => ({
      name: item.name,
      count: data.periodLeads.filter((lead) => lead.source_id === item.id)
        .length,
    }))
    .filter((item: any) => item.count);
  const total = Math.max(1, data.periodLeads.length);
  const transactions = (financial?.monthly || []).filter((item: any) =>
    inPeriod(item.transaction_date, range),
  );
  const revenue = transactions
    .filter((item: any) =>
      ["income", "invoice_payment"].includes(item.transaction_type),
    )
    .reduce((sum: number, item: any) => sum + Number(item.amount), 0);
  const expenses = transactions
    .filter((item: any) =>
      ["expense", "payroll_payment"].includes(item.transaction_type),
    )
    .reduce((sum: number, item: any) => sum + Number(item.amount), 0);
  const maxPoint = Math.max(
    1,
    ...data.daily.flatMap(([, item]) => [item.leads, item.converted]),
  );
  return (
    <section className="mx-auto max-w-[1320px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">CRM</p>
          <h1 className="text-2xl font-bold">CRM Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Overview of lead, sales and follow-up performance.
          </p>
        </div>
        <div className="flex rounded-lg border bg-white p-1">
          {(["today", "week", "month"] as Period[]).map((item) => (
            <button
              key={item}
              onClick={() => setPeriod(item)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${period === item ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {item === "week"
                ? "This Week"
                : item === "month"
                  ? "This Month"
                  : "Today"}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["New Leads", data.periodLeads.length],
          [
            "Follow-ups Due",
            data.followups.due.length + data.followups.overdue.length,
          ],
          ["Converted Clients", data.converted.length],
          [
            "Conversion Rate",
            `${data.periodLeads.length ? Math.round((data.converted.length / data.periodLeads.length) * 100) : 0}%`,
          ],
        ].map(([label, value]) => (
          <div className="card p-4" key={String(label)}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-slate-500">
              {range.start} – {range.end}
            </p>
          </div>
        ))}
        {financeAllowed &&
          [
            ["Sales / Revenue", inr(revenue)],
            ["Expenses", inr(expenses)],
            ["Net Result", inr(revenue - expenses)],
          ].map(([label, value]) => (
            <div className="card p-4" key={label}>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
              <p className="mt-1 text-xs text-slate-500">
                Recognized ledger activity
              </p>
            </div>
          ))}
      </div>
      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold">Lead Performance</h2>
          <p className="mt-1 text-sm text-slate-500">
            New and converted leads in the selected period.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-teal-600" />New leads</span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-300" />Converted leads</span>
          </div>
        </div>
        <div className="flex h-56 items-end gap-2 overflow-x-auto p-5">
          {data.daily.length ? (
            data.daily.map(([date, point]) => (
              <div
                className="flex min-w-10 flex-1 flex-col justify-end gap-1 text-center text-[10px] text-slate-500"
                key={date}
              >
                <div className="flex h-44 items-end justify-center gap-1">
                  <i
                    title={`New leads: ${point.leads}`}
                    className="w-3 rounded-t bg-teal-600"
                    style={{
                      height: `${Math.max(4, (point.leads / maxPoint) * 100)}%`,
                    }}
                  />
                  <i
                    title={`Converted: ${point.converted}`}
                    className="w-3 rounded-t bg-emerald-300"
                    style={{
                      height: `${Math.max(point.converted ? 4 : 0, (point.converted / maxPoint) * 100)}%`,
                    }}
                  />
                </div>
                {date.slice(5)}
              </div>
            ))
          ) : (
            <p className="m-auto text-sm text-slate-500">
              No lead activity in this period.
            </p>
          )}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="Lead Status" rows={statusRows} total={total} />
        <Breakdown title="Lead Sources" rows={sourceRows} total={total} />
      </div>
      {financeAllowed && (
        <section className="card p-5">
          <h2 className="font-bold">Financial Overview</h2>
          <p className="mt-1 text-sm text-slate-500">
            Recognized income and recorded expenses for the selected period.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["Revenue", revenue, "bg-teal-600"],
              ["Expenses", expenses, "bg-rose-400"],
              ["Net", revenue - expenses, "bg-slate-700"],
            ].map(([label, value, tone]) => (
              <div key={String(label)}>
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <b>{inr(value)}</b>
                </div>
                <div className="mt-2 h-2 rounded bg-slate-100">
                  <div
                    className={`h-full rounded ${tone}`}
                    style={{
                      width: `${Math.min(100, (Number(value) / Math.max(revenue, expenses, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold">Follow-ups</h2>
            <p className="mt-1 text-sm text-slate-500">
              A compact operational summary.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              ["Due Today", data.followups.due.length],
              ["Overdue", data.followups.overdue.length],
              ["Upcoming", data.followups.upcoming.length],
              ["Completed", data.followups.completed.length],
            ].map(([label, value]) => (
              <Link
                className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                href="/admin/crm/follow-ups"
                key={String(label)}
              >
                <p className="text-sm text-slate-500">{label}</p>
                <b className="mt-1 block text-xl">{value}</b>
              </Link>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-bold">Conversion progression</h2>
          <p className="mt-1 text-sm text-slate-500">
            Based on configured CRM status names and recorded conversions.
          </p>
          <div className="mt-5 space-y-3">
            {[
              ["Leads", data.periodLeads.length],
              [
                "Contacted",
                data.periodLeads.filter((l) =>
                  /contact/i.test(l.status?.name || ""),
                ).length,
              ],
              [
                "Assessment",
                data.periodLeads.filter((l) =>
                  /assessment/i.test(l.status?.name || ""),
                ).length,
              ],
              ["Converted", data.converted.length],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-teal-600"
                    style={{ width: `${(Number(value) / total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
function Breakdown({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { name: string; count: number }[];
  total: number;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.length ? (
          rows.map((row, index) => (
            <div key={row.name}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <i
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: palette[index % palette.length] }}
                  />
                  {row.name}
                </span>
                <b>
                  {row.count} · {Math.round((row.count / total) * 100)}%
                </b>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(row.count / total) * 100}%`,
                    backgroundColor: palette[index % palette.length],
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No records in this period.</p>
        )}
      </div>
    </section>
  );
}
