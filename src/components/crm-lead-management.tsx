"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminRepository } from "@/lib/admin-repository";
import { currentProfile } from "@/lib/auth";
import { CompactEmptyState, CompactPageHeader, DataTableShell, ModuleTabs, ModuleToolbar, Pagination, StatusBadge } from "@/components/compact-module";
import { crmFollowupState, filterCrmLeads } from "@/lib/crm-lead-workspace";
import { paginateRecords } from "@/lib/leave-workspace";

const today = () => new Date().toISOString().slice(0, 10);
const emptyFilters = { query: "", status: "", source: "", assignee: "", from: "", to: "", followup: "", unassigned: false };
const followupTone = (label: string) => label === "Overdue" ? "crm-followup-overdue" : label === "Due today" ? "crm-followup-today" : label === "Upcoming" ? "crm-followup-upcoming" : "";

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
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
      filterCrmLeads(leads, filters, today()).filter(lead =>
        (!filters.from || String(lead.lead_date || lead.created_at).slice(0, 10) >= filters.from) &&
        (!filters.to || String(lead.lead_date || lead.created_at).slice(0, 10) <= filters.to)),
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
  const converted = leads.filter((lead) => lead.converted_at).length;
  const paginated = useMemo(() => paginateRecords(shown, page, pageSize), [shown, page, pageSize]);
  const statusTabs = [
    { value: "", label: "All", count: leads.length },
    ...lookups.statuses.map((item: any) => ({ value: item.id as string, label: item.name as string, count: leads.filter(lead => lead.status_id === item.id).length })),
  ];
  const setFilter = (key: string, value: string | boolean) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
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
  return (
    <section className="compact-module crm-leads-workspace">
      <CompactPageHeader title="CRM / Leads" description="Find enquiries, prioritize follow-ups, and open the next lead workspace." action={<><Link className="btn border" href="/admin/crm/import">Import</Link><Link className="btn border" href="/admin/crm/sales">Sales</Link><button className="btn btn-primary" onClick={() => setAddOpen(true)}>Add lead</button></>} />
      <div className="module-summary-strip" aria-label="Lead summary"><div><span>Total</span><b>{leads.length}</b></div><div><span>Due today</span><b>{dueToday}</b></div><div><span>Overdue</span><b>{overdue}</b></div><div><span>Converted</span><b>{converted}</b></div></div>
      {error ? <p role="alert" className="module-alert module-alert-error">{error}</p> : null}
      {notice ? <p role="status" className="module-alert module-alert-success">{notice}</p> : null}
      <ModuleTabs tabs={statusTabs} value={filters.status} onChange={value => setFilter("status", value)} label="Lead stage" />
      <ModuleToolbar>
        <label className="module-search"><span className="sr-only">Search leads</span><input className="input" type="search" placeholder="Search name, phone, or email" value={filters.query} onChange={event => setFilter("query", event.target.value)} /></label>
        <label><span className="sr-only">Lead source</span><select className="input" value={filters.source} onChange={event => setFilter("source", event.target.value)}><option value="">All sources</option>{lookups.sources.map((source: any) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
        <label><span className="sr-only">Assigned employee</span><select className="input" value={filters.assignee} onChange={event => setFilter("assignee", event.target.value)}><option value="">All assignees</option>{people.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select></label>
        <label><span className="sr-only">Follow-up state</span><select className="input" value={filters.followup} onChange={event => setFilter("followup", event.target.value)}><option value="">All follow-ups</option>{["Due today", "Overdue", "Upcoming", "No follow-up"].map(option => <option key={option}>{option}</option>)}</select></label>
        <details className="crm-more-filters"><summary>More filters</summary><div><label>Created from<input className="input" type="date" value={filters.from} onChange={event => setFilter("from", event.target.value)} /></label><label>Created to<input className="input" type="date" value={filters.to} onChange={event => setFilter("to", event.target.value)} /></label><label className="crm-unassigned"><input type="checkbox" checked={filters.unassigned} onChange={event => setFilter("unassigned", event.target.checked)} /> Unassigned only</label></div></details>
        <button type="button" className="btn module-reset" disabled={Object.entries(filters).every(([, value]) => !value)} onClick={() => { setFilters(emptyFilters); setPage(1); }}>Reset</button>
      </ModuleToolbar>
      <DataTableShell label="Lead records">
        <table className="module-table crm-leads-table"><thead><tr><th>Lead</th><th>Contact</th><th>Stage</th><th>Assigned to</th><th>Source</th><th>Next follow-up</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
          {loading ? Array.from({ length: 8 }, (_, index) => <tr className="module-skeleton-row" key={index}><td colSpan={7}><span /></td></tr>) : null}
          {!loading && paginated.records.map(lead => { const state = crmFollowupState(lead, today()); return <tr key={lead.id}><td data-private><b>{lead.full_name}</b><small>Added {String(lead.lead_date || lead.created_at || "").slice(0, 10) || "—"}</small></td><td data-private><b>{lead.phone || "—"}</b><small>{lead.email || "No email"}</small></td><td><StatusBadge status={lead.status?.name || "Unclassified"} /></td><td data-private>{lead.assignee?.full_name || <span className="crm-unassigned-copy">Unassigned</span>}</td><td>{lead.source?.name || "—"}</td><td><b className={followupTone(state.label)}>{state.label}</b><small>{state.date ? new Date(state.date).toLocaleDateString() : "No date scheduled"}</small></td><td><Link className="module-view" href={`/admin/crm/leads/${lead.id}`}>Open</Link></td></tr>; })}
          {!loading && shown.length === 0 ? <tr><td colSpan={7}><CompactEmptyState title="No leads found" description="Adjust the filters or choose another stage to see more leads." /></td></tr> : null}
        </tbody></table>
        <div className="module-mobile-records crm-mobile-records">
          {loading ? Array.from({ length: 5 }, (_, index) => <div className="module-mobile-skeleton" key={index} />) : null}
          {!loading && paginated.records.map(lead => { const state = crmFollowupState(lead, today()); return <article key={lead.id}><div><b data-private>{lead.full_name}</b><StatusBadge status={lead.status?.name || "Unclassified"} /></div><p data-private>{lead.phone || "No phone"} · {lead.assignee?.full_name || "Unassigned"}</p><small className={followupTone(state.label)}>{state.label}{state.date ? ` · ${new Date(state.date).toLocaleDateString()}` : ""}</small><Link className="module-view" href={`/admin/crm/leads/${lead.id}`}>Open lead</Link></article>; })}
          {!loading && shown.length === 0 ? <CompactEmptyState title="No leads found" description="Adjust the filters or choose another stage to see more leads." /> : null}
        </div>
        {!loading ? <Pagination page={paginated.page} pageSize={pageSize} pageSizeOptions={[10, 20, 50]} total={shown.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /> : null}
      </DataTableShell>
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
