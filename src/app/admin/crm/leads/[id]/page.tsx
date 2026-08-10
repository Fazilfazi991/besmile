"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { adminRepository } from "@/lib/admin-repository";
import { currentProfile } from "@/lib/auth";

const dateInput = (value?: string | null) =>
  value ? String(value).slice(0, 10) : "";

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<any>();
  const [lookups, setLookups] = useState<any>({ sources: [], statuses: [] });
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState("");
  const [sale, setSale] = useState<any>({
    sale_value: "",
    currency: "INR",
    closing_date: dateInput(new Date().toISOString()),
    service_details: "",
    first_session_date: "",
    second_session_date: "",
    third_session_date: "",
    notes: "",
  });
  const [patientNumber, setPatientNumber] = useState("");
  const [patientConversionOpen, setPatientConversionOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [item, options] = await Promise.all([
        adminRepository.crmLead(id),
        adminRepository.crmLookups(),
      ]);
      setLead(item);
      setLookups(options);
    } catch (caught: any) {
      setError(caught.message);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [id]);

  const saveLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      await adminRepository.updateLead(id, {
        full_name: form.get("full_name"),
        phone: form.get("phone"),
        source_id: form.get("source_id"),
        status_id: form.get("status_id"),
        temperature: form.get("temperature"),
        profession: form.get("profession") || null,
        location: form.get("location") || null,
        reason_for_enquiry: form.get("reason_for_enquiry") || null,
        remarks: form.get("remarks") || null,
      });
      setMessage("Lead details saved.");
      await load();
    } catch (caught: any) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };
  const addFollowup = async () => {
    if (!note.trim() && !outcome.trim()) {
      setError("Add a follow-up note or outcome.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const profile = (await currentProfile()) as any;
      if (!profile) throw new Error("Please sign in again.");
      const followupNumber =
        Math.max(
          0,
          ...(lead.crm_lead_followups || []).map((item: any) =>
            Number(item.followup_number || 0),
          ),
        ) + 1;
      await adminRepository.addLeadFollowup({
        lead_id: id,
        followup_number: followupNumber,
        follow_up_at: new Date().toISOString(),
        note: note.trim() || null,
        outcome: outcome.trim() || null,
        next_follow_up_at: next ? new Date(next).toISOString() : null,
        created_by: profile.id,
      });
      setNote("");
      setOutcome("");
      setNext("");
      setMessage(`Follow-up #${followupNumber} saved.`);
      await load();
    } catch (caught: any) {
      setError(caught.message || "Follow-up could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const convert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = (await currentProfile()) as any;
      if (!profile) throw new Error("Please sign in again.");
      await adminRepository.convertLead({
        ...sale,
        lead_id: id,
        sale_value: Number(sale.sale_value),
        closing_date: sale.closing_date || dateInput(new Date().toISOString()),
        first_session_date: sale.first_session_date || null,
        second_session_date: sale.second_session_date || null,
        third_session_date: sale.third_session_date || null,
        created_by: profile.id,
      });
      setMessage("Lead converted to a sale.");
      await load();
    } catch (caught: any) {
      setError(
        caught.message?.includes("duplicate")
          ? "This lead has already been converted to a sale."
          : caught.message,
      );
    } finally {
      setBusy(false);
    }
  };
  const convertPatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!patientNumber.trim()) {
      setError("Client ID is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const patient = await adminRepository.convertLeadToPatient(
        id,
        patientNumber,
      );
      setPatientConversionOpen(false);
      setMessage(
        `Lead converted to client ${patient.patient_number || patientNumber.trim()}.`,
      );
      await load();
    } catch (caught: any) {
      const text = String(
        caught.message || "Client conversion could not be completed.",
      );
      setError(
        /already in use|duplicate|23505/i.test(text)
          ? "That Client ID is already in use. Choose a different ID."
          : /already been converted/i.test(text)
            ? "This lead has already been converted to a client."
            : /permission/i.test(text)
              ? "You do not have permission to convert this lead to a client."
              : text,
      );
    } finally {
      setBusy(false);
    }
  };
  const archive = async () => {
    if (!window.confirm("Archive this lead?")) return;
    setBusy(true);
    try {
      await adminRepository.archiveLead(id);
      window.location.assign("/admin/crm");
    } catch (caught: any) {
      setError(caught.message);
      setBusy(false);
    }
  };

  if (!lead) return <p>Loading lead...</p>;
  const existingSale = lead.crm_sales?.[0];
  const convertedPatient = lead.converted_patient;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm font-semibold text-brand" href="/admin/crm">
            Back to leads
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{lead.full_name}</h1>
          <p className="text-slate-600">
            {lead.phone} {lead.location ? `· ${lead.location}` : ""}
          </p>
        </div>
        {!convertedPatient && <button className="btn btn-primary" disabled={busy} onClick={() => { setError(""); setPatientConversionOpen(true); }}>Convert to client</button>}
        {convertedPatient && <Link className="btn border" href={`/admin/patients/${convertedPatient.slug || convertedPatient.id}`}>Open client</Link>}
        <button
          className="rounded border border-rose-300 px-3 py-2 text-sm text-rose-700"
          disabled={busy}
          onClick={() => void archive()}
        >
          Archive lead
        </button>
      </div>
      {error && <p className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}
      {message && (
        <p className="rounded bg-emerald-50 p-3 text-emerald-800">{message}</p>
      )}
      {convertedPatient && <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><b>Converted to Client</b><p className="mt-1 text-sm">Client ID: {convertedPatient.patient_number}</p></div>}
      <form onSubmit={saveLead} className="card grid gap-3 p-5 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">Lead details</h2>
        <input
          className="input"
          name="full_name"
          defaultValue={lead.full_name}
          required
        />
        <input
          className="input"
          name="phone"
          defaultValue={lead.phone}
          required
        />
        <select
          className="input"
          name="source_id"
          defaultValue={lead.source_id || ""}
        >
          {lookups.sources.map((item: any) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          name="status_id"
          defaultValue={lead.status_id || ""}
        >
          {lookups.statuses.map((item: any) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          name="temperature"
          defaultValue={lead.temperature}
        >
          <option value="cold">Cold</option>
          <option value="warm">Warm</option>
          <option value="hot">Hot</option>
        </select>
        <input
          className="input"
          name="profession"
          placeholder="Profession"
          defaultValue={lead.profession || ""}
        />
        <input
          className="input"
          name="location"
          placeholder="Location"
          defaultValue={lead.location || ""}
        />
        <input
          className="input md:col-span-2"
          name="reason_for_enquiry"
          placeholder="Reason for enquiry"
          defaultValue={lead.reason_for_enquiry || ""}
        />
        <textarea
          className="input md:col-span-2"
          name="remarks"
          placeholder="Remarks"
          defaultValue={lead.remarks || ""}
        />
        <button className="btn btn-primary md:col-span-2" disabled={busy}>
          Save lead
        </button>
      </form>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">Follow-ups</h2>
          <div className="mt-3 grid gap-2">
            <textarea
              className="input"
              placeholder="Follow-up note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <input
              className="input"
              placeholder="Outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
            <label className="text-sm">
              Next follow-up
              <input
                className="input mt-1"
                type="datetime-local"
                value={next}
                onChange={(event) => setNext(event.target.value)}
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void addFollowup()}
            >
              Save follow-up
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {lead.crm_lead_followups?.length ? (
              lead.crm_lead_followups.map((item: any) => (
                <article className="border-t pt-3 text-sm" key={item.id}>
                  <b>{item.profiles?.full_name || "Team member"}</b>
                  <p>{item.note || item.outcome}</p>
                  {item.outcome && item.note && (
                    <p className="text-slate-600">Outcome: {item.outcome}</p>
                  )}
                  <small className="text-slate-500">
                    {new Date(item.created_at).toLocaleString()}
                    {item.next_follow_up_at
                      ? ` · Next: ${new Date(item.next_follow_up_at).toLocaleString()}`
                      : ""}
                  </small>
                </article>
              ))
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No follow-ups recorded.
              </p>
            )}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-bold">Sale conversion</h2>
          {existingSale ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <b>Converted:</b> {existingSale.currency}{" "}
                {existingSale.sale_value}
              </p>
              <p>
                <b>Closing date:</b> {existingSale.closing_date}
              </p>
              <p>{existingSale.service_details || "No service details."}</p>
              <Link
                className="text-brand font-semibold"
                href="/admin/crm/sales"
              >
                View sales
              </Link>
            </div>
          ) : (
            <form className="mt-3 grid gap-2" onSubmit={convert}>
              <input
                className="input"
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="Sale value"
                value={sale.sale_value}
                onChange={(event) =>
                  setSale({ ...sale, sale_value: event.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  placeholder="Currency"
                  value={sale.currency}
                  onChange={(event) =>
                    setSale({
                      ...sale,
                      currency: event.target.value.toUpperCase(),
                    })
                  }
                />
                <input
                  className="input"
                  type="date"
                  value={sale.closing_date}
                  onChange={(event) =>
                    setSale({ ...sale, closing_date: event.target.value })
                  }
                />
              </div>
              <textarea
                className="input"
                placeholder="Service details"
                value={sale.service_details}
                onChange={(event) =>
                  setSale({ ...sale, service_details: event.target.value })
                }
              />
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    "first_session_date",
                    "second_session_date",
                    "third_session_date",
                  ] as const
                ).map((field, index) => (
                  <label className="text-xs" key={field}>
                    Session {index + 1}
                    <input
                      className="input mt-1"
                      type="date"
                      value={sale[field]}
                      onChange={(event) =>
                        setSale({ ...sale, [field]: event.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <textarea
                className="input"
                placeholder="Sale notes"
                value={sale.notes}
                onChange={(event) =>
                  setSale({ ...sale, notes: event.target.value })
                }
              />
              <button className="btn btn-primary" disabled={busy}>
                Convert to sale
              </button>
            </form>
          )}
        </section>
      </div>
      {patientConversionOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form className="card w-full max-w-lg p-6" onSubmit={convertPatient}><h2 className="text-lg font-bold">Convert to Client</h2><p className="mt-1 text-sm text-slate-600">The lead remains in CRM. Matching contact and context fields will be copied to the new client record.</p><label className="mt-4 block text-sm font-semibold">Client ID <span className="text-rose-700">*</span><input autoFocus className="input mt-1" required value={patientNumber} onChange={event => setPatientNumber(event.target.value)} placeholder="Enter unique Client ID" /></label><p className="mt-2 text-xs text-slate-500">The Client ID must be unique. Validation errors keep your entered value.</p><div className="mt-5 flex justify-end gap-2"><button className="btn border" type="button" disabled={busy} onClick={() => setPatientConversionOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Converting...' : 'Convert to client'}</button></div></form></div>}
    </section>
  );
}
