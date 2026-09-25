"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { inr } from "@/components/finance-ui";
import { adminRepository } from "@/lib/admin-repository";
import { clientSafeError } from "@/lib/client-error";
import { marketingExpenseTotal } from "@/lib/crm-marketing-expenses";
import {
  CrmDashboardPeriod,
  CrmDashboardSummary,
  CrmDateRange,
  formatCrmConversionRate,
  currentCrmBusinessDate,
  crmDashboardPeriodRange,
  formatCrmRangeLabel,
  lastThirtyCrmDateRange,
  normalizeCrmDashboardSummary,
  sameCrmDateRange,
  thirtyDayLeadSeries,
  validateCustomCrmRange,
} from "@/lib/crm-dashboard-e1";

const palette = ["#0f766e", "#14b8a6", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f43f5e", "#64748b"];
const periodNames: Record<CrmDashboardPeriod, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  custom: "Custom",
};

export default function CrmDashboard() {
  const [today, setToday] = useState(currentCrmBusinessDate);
  const [period, setPeriod] = useState<CrmDashboardPeriod>("month");
  const [range, setRange] = useState<CrmDateRange>(() => crmDashboardPeriodRange("month", currentCrmBusinessDate()));
  const [summary, setSummary] = useState<CrmDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [marketingExpenses, setMarketingExpenses] = useState<number | null>(null);
  const [marketingError, setMarketingError] = useState("");
  const [leadSummary, setLeadSummary] = useState<CrmDashboardSummary | null>(null);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadError, setLeadError] = useState("");
  const [leadRetry, setLeadRetry] = useState(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState(29);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<CrmDateRange>(range);
  const [draftError, setDraftError] = useState("");
  const summaryRequest = useRef(0);
  const leadRequest = useRef(0);
  const customTrigger = useRef<HTMLButtonElement>(null);
  const customDialog = useRef<HTMLDivElement>(null);
  const customStart = useRef<HTMLInputElement>(null);
  const leadRange = useMemo(() => lastThirtyCrmDateRange(today), [today]);
  const rangeLabel = useMemo(() => formatCrmRangeLabel(range), [range]);
  const leadPoints = useMemo(
    () => leadSummary ? thirtyDayLeadSeries(leadSummary, leadRange) : [],
    [leadRange, leadSummary],
  );
  const selectedPoint = leadPoints[Math.min(selectedDayIndex, Math.max(0, leadPoints.length - 1))];
  const financeAllowed = summary?.financeAllowed === true;

  useEffect(() => {
    if (!financeAllowed) return;
    let active = true;
    const requestRange = { start: range.start, end: range.end };
    void adminRepository.crmMarketingExpenseTransactions(requestRange.start, requestRange.end)
      .then(rows => { if (active) { setMarketingExpenses(marketingExpenseTotal(rows, requestRange)); setMarketingError(""); } })
      .catch(error => { if (active) { setMarketingExpenses(null); setMarketingError(clientSafeError(error, "Marketing expenses could not be loaded. Refresh and try again.", { route: "/admin/crm", action: "load-marketing-expenses" })); } });
    return () => { active = false; };
  }, [financeAllowed, range.start, range.end, summaryRetry]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextToday = currentCrmBusinessDate();
      setToday(current => {
        if (current === nextToday) return current;
        setLeadSummary(null);
        setLeadLoading(true);
        setLeadError("");
        if (period !== "custom") {
          setSummary(null);
          setMarketingExpenses(null);
          setSummaryLoading(true);
          setSummaryError("");
          setRange(crmDashboardPeriodRange(period, nextToday));
        }
        return nextToday;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [period]);

  useEffect(() => {
    const request = ++summaryRequest.current;
    let active = true;
    const requestRange = { start: range.start, end: range.end };
    void adminRepository.crmDashboardSummary(requestRange.start, requestRange.end)
      .then(value => normalizeCrmDashboardSummary(value, requestRange))
      .then(value => {
        if (active && request === summaryRequest.current) setSummary(value);
      })
      .catch(error => {
        if (active && request === summaryRequest.current) {
          setSummaryError(clientSafeError(error, "CRM dashboard data could not be loaded. Refresh and try again.", {
            route: "/admin/crm",
            action: "load-period-summary",
          }));
        }
      })
      .finally(() => {
        if (active && request === summaryRequest.current) setSummaryLoading(false);
      });
    return () => { active = false; };
  }, [range.end, range.start, summaryRetry]);

  useEffect(() => {
    const request = ++leadRequest.current;
    let active = true;
    const requestRange = { start: leadRange.start, end: leadRange.end };
    void adminRepository.crmDashboardSummary(requestRange.start, requestRange.end)
      .then(value => normalizeCrmDashboardSummary(value, requestRange))
      .then(value => {
        if (active && request === leadRequest.current) {
          setLeadSummary(value);
          setSelectedDayIndex(29);
        }
      })
      .catch(error => {
        if (active && request === leadRequest.current) {
          setLeadError(clientSafeError(error, "Lead Performance data could not be loaded. Refresh and try again.", {
            route: "/admin/crm",
            action: "load-30-day-lead-performance",
          }));
        }
      })
      .finally(() => {
        if (active && request === leadRequest.current) setLeadLoading(false);
      });
    return () => { active = false; };
  }, [leadRange.end, leadRange.start, leadRetry]);

  const closeCustom = useCallback(() => {
    setCustomOpen(false);
    setDraftError("");
    window.requestAnimationFrame(() => customTrigger.current?.focus());
  }, []);

  useEffect(() => {
    if (!customOpen) return;
    window.requestAnimationFrame(() => customStart.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCustom();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(customDialog.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeCustom, customOpen]);

  function choosePreset(nextPeriod: Exclude<CrmDashboardPeriod, "custom">) {
    const nextRange = crmDashboardPeriodRange(nextPeriod, today);
    setPeriod(nextPeriod);
    if (sameCrmDateRange(range, nextRange)) return;
    setSummary(null);
    setMarketingExpenses(null);
    setSummaryLoading(true);
    setSummaryError("");
    setRange(nextRange);
  }

  function openCustom() {
    setDraftRange(range);
    setDraftError("");
    setCustomOpen(true);
  }

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateCustomCrmRange(draftRange, today);
    if (validation) { setDraftError(validation); return; }
    setPeriod("custom");
    if (!sameCrmDateRange(range, draftRange)) {
      setSummary(null);
      setMarketingExpenses(null);
      setSummaryLoading(true);
      setSummaryError("");
      setRange(draftRange);
    }
    closeCustom();
  }

  const statusRows = summary?.statuses || [];
  const sourceRows = summary?.sources || [];
  const total = Math.max(1, Number(summary?.periodLeads || 0));
  const revenue = Number(summary?.revenue || 0);
  const expenses = Number(summary?.expenses || 0);
  const metricRows = [
    { label: "New Leads", value: summary?.periodLeads, context: rangeLabel },
    { label: "Open Follow-ups", value: summary ? summary.followups.due + summary.followups.overdue : undefined, context: `Current queue · as of ${today}` },
    { label: "Converted Clients", value: summary?.converted, context: rangeLabel },
    { label: "Conversion Rate", value: summary ? formatCrmConversionRate(summary) : undefined, context: rangeLabel },
  ];

  return (
    <section className="mx-auto min-w-0 max-w-[1320px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">CRM</p>
          <h1 className="text-2xl font-bold">CRM Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Overview of lead, sales and follow-up performance.</p>
        </div>
        <div className="min-w-0 max-w-full">
          <div className="flex max-w-full flex-wrap rounded-xl border bg-white p-1" aria-label="CRM dashboard period">
            {(["today", "week", "month"] as const).map(item => (
              <button
                type="button"
                key={item}
                onClick={() => choosePreset(item)}
                aria-pressed={period === item}
                className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${period === item ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >{periodNames[item]}</button>
            ))}
            <button
              type="button"
              ref={customTrigger}
              onClick={openCustom}
              aria-pressed={period === "custom"}
              aria-haspopup="dialog"
              className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${period === "custom" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >Custom</button>
          </div>
          <p className="mt-2 text-left text-xs font-medium text-slate-600 sm:text-right" data-testid="crm-selected-range">
            {periodNames[period]} · {rangeLabel}
          </p>
        </div>
      </div>

      {summaryError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          <span>{summaryError}</span>
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { setSummary(null); setSummaryLoading(true); setSummaryError(""); setSummaryRetry(value => value + 1); }}>Retry</button>
        </div>
      )}
      {marketingError && financeAllowed && <p className="text-sm text-rose-700" role="status">{marketingError}</p>}
      {summaryLoading && <div className="dashboard-progress" role="status"><span />Refreshing CRM summary…</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={summaryLoading}>
        {metricRows.map(metric => <MetricCard key={metric.label} {...metric} />)}
        {financeAllowed && ([{ label: "Sales / Revenue", value: inr(revenue) }, { label: "Marketing Expenses", value: marketingExpenses === null ? undefined : inr(marketingExpenses) }, { label: "Net Result", value: inr(revenue - expenses) }]).map(({ label, value }) => <MetricCard key={label} label={label} value={value} context={rangeLabel} />)}
      </div>

      <section className="card min-w-0 overflow-hidden" data-testid="lead-performance-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div><h2 className="font-bold">Lead Performance</h2><p className="mt-1 text-sm text-slate-500">Last 30 days · new leads by canonical lead date.</p></div>
          {leadSummary && <div className="rounded-lg bg-teal-50 px-3 py-2 text-right"><span className="block text-xs text-teal-800">30-day total</span><strong className="text-lg text-teal-950" data-testid="lead-performance-total">{leadSummary.periodLeads}</strong></div>}
        </div>
        {leadError ? (
          <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            <span>{leadError}</span><button type="button" className="font-semibold underline underline-offset-2" onClick={() => { setLeadSummary(null); setLeadLoading(true); setLeadError(""); setLeadRetry(value => value + 1); }}>Retry chart</button>
          </div>
        ) : leadLoading ? (
          <div className="grid h-64 place-items-center text-sm text-slate-500" role="status">Loading the last 30 days…</div>
        ) : leadPoints.length === 30 ? (
          <div className="min-w-0 px-3 pb-5 pt-4 sm:px-5">
            <div className="h-60 min-w-0" role="img" aria-label={`Lead Performance for the last 30 days. ${leadSummary?.periodLeads || 0} new leads in total.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  accessibilityLayer
                  data={leadPoints}
                  margin={{ top: 12, right: 10, bottom: 4, left: -12 }}
                  onClick={(state: any) => {
                    const index = Number(state?.activeTooltipIndex);
                    if (Number.isInteger(index) && index >= 0 && index < leadPoints.length) setSelectedDayIndex(index);
                  }}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={value => String(value).slice(5)} tickLine={false} axisLine={false} minTickGap={18} tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip content={<LeadPerformanceTooltip />} cursor={{ stroke: "#99f6e4", strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="leads" name="New leads" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#0f766e", stroke: "#ffffff", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="min-w-0 text-xs font-semibold text-slate-700">
                Inspect a daily value
                <input className="mt-2 block w-full accent-teal-700" type="range" min="0" max="29" step="1" value={selectedDayIndex} aria-label="Inspect Lead Performance day" onChange={event => setSelectedDayIndex(Number(event.target.value))} />
              </label>
              <output className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm" aria-live="polite"><strong>{selectedPoint?.date}</strong> · {selectedPoint?.leads || 0} new {selectedPoint?.leads === 1 ? "lead" : "leads"}</output>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-teal-800">View all 30 daily values</summary>
              <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left" data-testid="lead-performance-table">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600"><tr><th className="px-3 py-2">Business date</th><th className="px-3 py-2 text-right">New leads</th></tr></thead>
                  <tbody>{leadPoints.map(point => <tr className="border-t border-slate-100" key={point.date}><td className="px-3 py-2">{point.date}</td><td className="px-3 py-2 text-right font-semibold">{point.leads}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="Lead Status" rows={statusRows} total={total} loading={summaryLoading} />
        <Breakdown title="Lead Sources" rows={sourceRows} total={total} loading={summaryLoading} />
      </div>

      {financeAllowed && (
        <section className="card p-5">
          <h2 className="font-bold">Financial Overview</h2>
          <p className="mt-1 text-sm text-slate-500">Recognized income and recorded expenses for {rangeLabel.toLowerCase()}.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[["Revenue", revenue, "bg-teal-600"], ["Expenses", expenses, "bg-rose-400"], ["Net", revenue - expenses, "bg-slate-700"]].map(([label, value, tone]) => (
              <div key={String(label)}><div className="flex justify-between text-sm"><span>{label}</span><b>{inr(value)}</b></div><div className="mt-2 h-2 rounded bg-slate-100"><div className={`h-full rounded ${tone}`} style={{ width: `${Math.min(100, Math.max(0, (Number(value) / Math.max(revenue, expenses, 1)) * 100))}%` }} /></div></div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Follow-ups</h2><p className="mt-1 text-sm text-slate-500">Current queue plus completed work in the selected period.</p></div>
          <div className="grid grid-cols-2 gap-3 p-5">
            {[["Due Today", summary?.followups.due, `Current · ${today}`], ["Overdue", summary?.followups.overdue, `Current · ${today}`], ["Upcoming", summary?.followups.upcoming, `Current · ${today}`], ["Completed", summary?.followups.completed, rangeLabel]].map(([label, value, context]) => (
              <Link className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50" href="/admin/crm/follow-ups" key={String(label)}><p className="text-sm text-slate-500">{label}</p><b className="mt-1 block text-xl">{value ?? "—"}</b><small className="mt-1 block text-[11px] text-slate-500">{context}</small></Link>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-bold">Conversion progression</h2><p className="mt-1 text-sm text-slate-500">Selected period · {rangeLabel}</p>
          <div className="mt-5 space-y-3">
            {[["Leads", summary?.periodLeads], ["Contacted", summary?.contacted], ["Assessment", summary?.assessment], ["Converted", summary?.converted]].map(([label, value]) => (
              <div key={String(label)}><div className="flex justify-between text-sm"><span>{label}</span><b>{value ?? "—"}</b></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-full rounded bg-teal-600" style={{ width: `${summary ? Math.min(100, (Number(value) / total) * 100) : 0}%` }} /></div></div>
            ))}
          </div>
        </section>
      </div>

      {customOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] grid place-items-end bg-slate-950/40 p-0 sm:place-items-center sm:p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeCustom(); }}>
          <div ref={customDialog} className="w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="custom-range-title" aria-describedby="custom-range-description" onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); closeCustom(); } }}>
            <div className="flex items-start justify-between gap-4"><div><h2 id="custom-range-title" className="text-xl font-bold text-slate-950">Custom CRM period</h2><p id="custom-range-description" className="mt-1 text-sm text-slate-600">Choose inclusive business dates. Future dates are unavailable.</p></div><button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xl text-slate-600 hover:bg-slate-100" aria-label="Close custom date range" onClick={closeCustom}>×</button></div>
            <form className="mt-5" onSubmit={applyCustom} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Start date<input ref={customStart} className="input mt-1.5 min-h-11 w-full" type="date" max={today} value={draftRange.start} onChange={event => { setDraftRange(current => ({ ...current, start: event.target.value })); setDraftError(""); }} /></label>
                <label className="text-sm font-semibold text-slate-700">End date<input className="input mt-1.5 min-h-11 w-full" type="date" max={today} value={draftRange.end} onChange={event => { setDraftRange(current => ({ ...current, end: event.target.value })); setDraftError(""); }} /></label>
              </div>
              <p className="mt-3 min-h-5 text-sm font-medium text-rose-700" role={draftError ? "alert" : undefined}>{draftError}</p>
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn min-h-11 border" onClick={closeCustom}>Cancel</button><button type="submit" className="btn btn-primary min-h-11">Apply date range</button></div>
            </form>
          </div>
        </div>
      , document.body)}
    </section>
  );
}

function MetricCard({ label, value, context }: { label: string; value: string | number | undefined; context: string }) {
  return <div className="card p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value ?? "—"}</p><p className="mt-1 text-xs text-slate-500">{context}</p></div>;
}

function LeadPerformanceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"><b className="block text-slate-900">{label}</b><span className="mt-1 block text-slate-600">New leads <strong className="text-teal-800">{Number(payload[0]?.value || 0)}</strong></span></div>;
}

function Breakdown({ title, rows, total, loading }: { title: string; rows: { name: string; count: number }[]; total: number; loading: boolean }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-4 space-y-3">
        {loading ? <p className="text-sm text-slate-500">Refreshing this period…</p> : rows.length ? rows.map((row, index) => (
          <div key={row.name}><div className="flex justify-between gap-3 text-sm"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />{row.name}</span><b>{row.count} · {Math.round((row.count / total) * 100)}%</b></div><div className="mt-1 h-2 rounded bg-slate-100"><div className="h-full rounded" style={{ width: `${(row.count / total) * 100}%`, backgroundColor: palette[index % palette.length] }} /></div></div>
        )) : <p className="text-sm text-slate-500">No records in this period.</p>}
      </div>
    </section>
  );
}
