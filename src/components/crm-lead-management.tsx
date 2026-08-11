"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminRepository } from "@/lib/admin-repository";
import { currentProfile } from "@/lib/auth";
import { inr } from "@/components/finance-ui";

const today = () => new Date().toISOString().slice(0, 10);
const leadBadge = (value?: string) => {
  const normalized = String(value || "").toLowerCase();
  return normalized.includes("convert")
    ? "bg-emerald-50 text-emerald-800"
    : normalized.includes("lost")
      ? "bg-rose-50 text-rose-800"
      : normalized.includes("interest")
        ? "bg-violet-50 text-violet-800"
        : normalized.includes("follow")
          ? "bg-amber-50 text-amber-800"
          : "bg-slate-100 text-slate-700";
};
const followupState = (lead: any) => {
  const dates = (lead.crm_lead_followups || [])
    .map((item: any) => item.next_follow_up_at)
    .filter(Boolean)
    .sort();
  const next = dates[0];
  if (!next) return { label: "No follow-up", tone: "text-slate-500", date: "" };
  const day = String(next).slice(0, 10);
  return day < today()
    ? { label: "Overdue", tone: "text-rose-700", date: next }
    : day === today()
      ? { label: "Due today", tone: "text-amber-700", date: next }
      : { label: "Upcoming", tone: "text-teal-700", date: next };
};

export default function LeadManagement() {
  const [profile, setProfile] = useState<any>();
  const [leads, setLeads] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [lookups, setLookups] = useState<any>({ sources: [], statuses: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [filters, setFilters] = useState({
    query: "",
    status: "",
    source: "",
    assignee: "",
    from: "",
    to: "",
    followup: "",
    unassigned: false,
  });
  const [form, setForm] = useState<any>({
    full_name: "",
    phone: "",
    source_id: "",
    status_id: "",
    temperature: "cold",
    assigned_to: "",
    reason_for_enquiry: "",
    location: "",
    remarks: "",
  });
  const load = async () => {
    setLoading(true);
    try {
      const current = (await currentProfile()) as any;
      if (!current) throw new Error("Please sign in to access CRM.");
      const [data, staff, options] = await Promise.all([
        adminRepository.crmLeads(),
        adminRepository.employees("", 0, 100),
        adminRepository.crmLookups(),
      ]);
      setProfile(current);
      setLeads(data || []);
      setPeople(staff.data || []);
      setLookups(options);
      setForm((currentForm: any) => ({
        ...currentForm,
        source_id: currentForm.source_id || options.sources[0]?.id || "",
        status_id: currentForm.status_id || options.statuses[0]?.id || "",
        assigned_to: currentForm.assigned_to || current.id,
      }));
      setError("");
    } catch (caught: any) {
      setError(caught.message || "CRM data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const shown = useMemo(
    () =>
      leads.filter((lead) => {
        const term = filters.query.toLowerCase();
        const followup = followupState(lead);
        return (
          (!term ||
            [lead.full_name, lead.phone, lead.email].some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(term),
            )) &&
          (!filters.status || lead.status_id === filters.status) &&
          (!filters.source || lead.source_id === filters.source) &&
          (!filters.assignee || lead.assigned_to === filters.assignee) &&
          (!filters.from ||
            String(lead.lead_date || lead.created_at).slice(0, 10) >=
              filters.from) &&
          (!filters.to ||
            String(lead.lead_date || lead.created_at).slice(0, 10) <=
              filters.to) &&
          (!filters.followup || followup.label === filters.followup) &&
          (!filters.unassigned || !lead.assigned_to)
        );
      }),
    [leads, filters],
  );
  const followups = leads.flatMap((lead) =>
    (lead.crm_lead_followups || []).map((item: any) => ({ ...item, lead })),
  );
  const dueToday = followups.filter(
    (item) => String(item.next_follow_up_at || "").slice(0, 10) === today(),
  ).length;
  const overdue = followups.filter(
    (item) =>
      item.next_follow_up_at &&
      String(item.next_follow_up_at).slice(0, 10) < today(),
  ).length;
  const sales = leads.flatMap((lead) => lead.crm_sales || []);
  const salesThisMonth = sales.filter(
    (sale) =>
      String(sale.closing_date || "").slice(0, 7) === today().slice(0, 7),
  );
  const saleTotal = salesThisMonth.reduce(
    (sum, sale) => sum + Number(sale.sale_value || 0),
    0,
  );
  const converted = leads.filter((lead) => lead.converted_at).length;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.full_name.trim() || form.phone.replace(/\D/g, "").length < 7) {
      setError("Enter a lead name and a phone number with at least 7 digits.");
      return;
    }
    setSubmitting(true);
    try {
      if (!profile) throw new Error("Please sign in again.");
      const duplicate = leads.some(
        (lead) =>
          String(lead.phone || "").replace(/\D/g, "") ===
          form.phone.replace(/\D/g, ""),
      );
      if (
        duplicate &&
        !window.confirm(
          "A lead with this phone number already exists. Create another lead anyway?",
        )
      ) {
        setSubmitting(false);
        return;
      }
      await adminRepository.createLead({
        ...form,
        full_name: form.full_name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        reason_for_enquiry: form.reason_for_enquiry || null,
        location: form.location || null,
        remarks: form.remarks || null,
        created_by: profile.id,
      });
      setForm((current: any) => ({
        ...current,
        full_name: "",
        phone: "",
        reason_for_enquiry: "",
        location: "",
        remarks: "",
      }));
      setAddOpen(false);
      setNotice("Lead added and assigned successfully.");
      await load();
    } catch (caught: any) {
      setError(
        caught.message || "Lead could not be created. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  if (loading)
    return (
      <section className="mx-auto max-w-[1320px] space-y-4">
        <div className="h-10 w-64 animate-pulse rounded bg-slate-100" />
        {Array.from({ length: 3 }, (_, index) => (
          <div className="card h-28 animate-pulse" key={index} />
        ))}
      </section>
    );
  return (
    <section className="mx-auto max-w-[1320px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">CRM</p>
          <h1 className="text-2xl font-bold">Leads Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage, assign, follow up and convert enquiries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn border" href="/admin/crm/import">
            Import Leads
          </Link>
          <Link className="btn border" href="/admin/crm/sales">
            View sales
          </Link>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            + Add Lead
          </button>
        </div>
      </div>
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          {notice}
        </p>
      )}
      <div className="hidden">
        {[
          ["Total leads", leads.length, "All active enquiries"],
          [
            "New today",
            leads.filter(
              (lead) =>
                String(lead.lead_date || lead.created_at).slice(0, 10) ===
                today(),
            ).length,
            "Added today",
          ],
          ["Follow-ups due", dueToday, "Due today"],
          ["Overdue follow-ups", overdue, "Needs attention"],
          ["Converted clients", converted, "Leads converted"],
          [
            "Sales this month",
            inr(saleTotal),
            `${salesThisMonth.length} conversion${salesThisMonth.length === 1 ? "" : "s"}`,
          ],
          [
            "Conversion rate",
            `${leads.length ? Math.round((converted / leads.length) * 100) : 0}%`,
            "Converted / total",
          ],
          [
            "Unassigned",
            leads.filter((lead) => !lead.assigned_to).length,
            "Needs an owner",
          ],
        ].map(([label, value, hint], index) => (
          <div
            className={`card p-4 ${index === 3 && overdue ? "border-rose-200" : ""}`}
            key={String(label)}
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{String(value)}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </div>
      <div className="hidden">
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold">Lead status breakdown</h2>
            <p className="mt-1 text-sm text-slate-500">
              Live count by the statuses configured for this workspace.
            </p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {lookups.statuses.map((status: any) => (
              <div
                className="rounded-xl border border-slate-100 p-3"
                key={status.id}
              >
                <p className="text-sm text-slate-600">{status.name}</p>
                <b className="mt-1 block text-xl">
                  {leads.filter((lead) => lead.status_id === status.id).length}
                </b>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold">Follow-up overview</h2>
            <p className="mt-1 text-sm text-slate-500">
              Operational queue from the current lead follow-up records.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              ["Due today", dueToday],
              ["Overdue", overdue],
              [
                "Upcoming",
                followups.filter(
                  (item) =>
                    item.next_follow_up_at &&
                    String(item.next_follow_up_at).slice(0, 10) > today(),
                ).length,
              ],
              ["Completed", followups.filter((item) => item.outcome).length],
            ].map(([label, value]) => (
              <Link
                className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                href="/employee/crm/follow-ups"
                key={String(label)}
              >
                <p className="text-sm text-slate-600">{label}</p>
                <b className="mt-1 block text-xl">{value}</b>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold">Lead records</h2>
          <p className="mt-1 text-sm text-slate-500">
            Search by client name or phone number, then act on the lead from its
            workspace.
          </p>
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-[minmax(220px,1fr)_150px_150px_160px_150px_150px_auto]">
          <input
            className="input"
            placeholder="Search name or phone"
            value={filters.query}
            onChange={(event) =>
              setFilters({ ...filters, query: event.target.value })
            }
          />
          <select
            className="input"
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="">All statuses</option>
            {lookups.statuses.map((status: any) => (
              <option value={status.id} key={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.source}
            onChange={(event) =>
              setFilters({ ...filters, source: event.target.value })
            }
          >
            <option value="">All sources</option>
            {lookups.sources.map((source: any) => (
              <option value={source.id} key={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.assignee}
            onChange={(event) =>
              setFilters({ ...filters, assignee: event.target.value })
            }
          >
            <option value="">All assignees</option>
            {people.map((person) => (
              <option value={person.id} key={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.followup}
            onChange={(event) =>
              setFilters({ ...filters, followup: event.target.value })
            }
          >
            <option value="">All follow-ups</option>
            {["Due today", "Overdue", "Upcoming", "No follow-up"].map(
              (option) => (
                <option key={option}>{option}</option>
              ),
            )}
          </select>
          <input
            className="input"
            type="date"
            aria-label="Created from"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
          <input
            className="input"
            type="date"
            aria-label="Created to"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
          <label className="flex items-center gap-2 px-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={filters.unassigned}
              onChange={(event) =>
                setFilters({ ...filters, unassigned: event.target.checked })
              }
            />
            Unassigned
          </label>
          <button
            className="px-2 text-sm font-semibold text-teal-700 hover:underline"
            onClick={() =>
              setFilters({
                query: "",
                status: "",
                source: "",
                assignee: "",
                from: "",
                to: "",
                followup: "",
                unassigned: false,
              })
            }
          >
            Clear filters
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {[
                  "Lead",
                  "Contact",
                  "Status",
                  "Assignee",
                  "Source",
                  "Latest / next follow-up",
                  "Sale status",
                  "Action",
                ].map((label) => (
                  <th className="px-4 py-3 text-left" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((lead) => {
                const state = followupState(lead);
                const followupNumber = Math.max(
                  0,
                  ...(lead.crm_lead_followups || []).map((item: any) =>
                    Number(item.followup_number || 0),
                  ),
                );
                return (
                  <tr className="border-t border-slate-100" key={lead.id}>
                    <td className="px-4 py-3">
                      <b>{lead.full_name}</b>
                      <small className="block text-slate-500">
                        {String(lead.created_at || lead.lead_date || "").slice(
                          0,
                          10,
                        )}
                      </small>
                    </td>
                    <td className="px-4 py-3">
                      {lead.phone}
                      <small className="block text-slate-500">
                        {lead.email || "—"}
                      </small>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${leadBadge(lead.status?.name)}`}
                      >
                        {lead.status?.name || "Unclassified"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.assignee?.full_name || (
                        <span className="text-amber-700">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{lead.source?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <b className={state.tone}>{state.label}</b>
                      <small className="block text-slate-500">
                        {followupNumber
                          ? `Follow-up #${followupNumber}`
                          : "No numbered follow-up"}
                        {state.date
                          ? ` · ${new Date(state.date).toLocaleString()}`
                          : ""}
                      </small>
                    </td>
                    <td className="px-4 py-3">
                      {lead.converted_at ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
                          Converted
                        </span>
                      ) : (
                        "Open"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold text-teal-700 hover:underline"
                        href={`/admin/crm/leads/${lead.id}`}
                      >
                        Open lead
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              No leads match these filters.
            </p>
          )}
        </div>
      </section>
      {addOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="card max-h-[90vh] w-full max-w-2xl overflow-auto p-6"
            onSubmit={submit}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Add lead</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create and assign a new customer enquiry.
                </p>
              </div>
              <button
                className="text-slate-500 hover:text-slate-950"
                type="button"
                onClick={() => setAddOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Full name" required>
                <input
                  className="input"
                  value={form.full_name}
                  onChange={(event) =>
                    setForm({ ...form, full_name: event.target.value })
                  }
                />
              </Field>
              <Field label="Phone number" required>
                <input
                  className="input"
                  type="tel"
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </Field>
              <Field label="Lead source">
                <select
                  className="input"
                  value={form.source_id}
                  onChange={(event) =>
                    setForm({ ...form, source_id: event.target.value })
                  }
                >
                  {lookups.sources.map((source: any) => (
                    <option value={source.id} key={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  className="input"
                  value={form.status_id}
                  onChange={(event) =>
                    setForm({ ...form, status_id: event.target.value })
                  }
                >
                  {lookups.statuses.map((status: any) => (
                    <option value={status.id} key={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assignee">
                <select
                  className="input"
                  value={form.assigned_to}
                  onChange={(event) =>
                    setForm({ ...form, assigned_to: event.target.value })
                  }
                >
                  {people.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Temperature">
                <select
                  className="input"
                  value={form.temperature}
                  onChange={(event) =>
                    setForm({ ...form, temperature: event.target.value })
                  }
                >
                  {["cold", "warm", "hot"].map((value) => (
                    <option value={value} key={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location">
                <input
                  className="input"
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                />
              </Field>
              <Field label="Reason for enquiry">
                <input
                  className="input"
                  value={form.reason_for_enquiry}
                  onChange={(event) =>
                    setForm({ ...form, reason_for_enquiry: event.target.value })
                  }
                />
              </Field>
              <Field label="Notes" className="md:col-span-2">
                <textarea
                  className="input min-h-24"
                  value={form.remarks}
                  onChange={(event) =>
                    setForm({ ...form, remarks: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="btn border"
                type="button"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={submitting}>
                {submitting ? "Adding…" : "Add lead"}
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
  required,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`block text-sm font-semibold text-slate-700 ${className}`}
    >
      <span>
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
