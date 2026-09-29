"use client";

import { FormEvent } from "react";

type LeadToPatientConversionProps = {
  open: boolean;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: () => Promise<boolean>;
};

export function LeadToPatientConversion({
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: LeadToPatientConversionProps) {
  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-client-conversion-title"
    >
      <form className="card w-full max-w-lg p-6" onSubmit={submit}>
        <h2 id="lead-client-conversion-title" className="text-lg font-bold">
          Convert to Client
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The lead remains in CRM. Matching contact and context fields will be
          copied to the new client record.
        </p>
        <p className="mt-4 rounded border border-brand/20 bg-brand/5 p-3 text-sm font-medium text-slate-700">
          Client ID will be generated automatically.
        </p>
        {error ? (
          <p className="mt-3 rounded bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="btn border"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Converting..." : "Convert to client"}
          </button>
        </div>
      </form>
    </div>
  );
}
