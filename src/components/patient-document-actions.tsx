'use client';

import { useState } from 'react';

/** The server endpoint and private Storage RLS both authorize each document. */
export function PatientDocumentActions({ patientId, documentId, filename }: {
  patientId: string; documentId: string; filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function access(download: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}/documents/${encodeURIComponent(documentId)}/signed-url`, { method: 'POST' });
      if (!response.ok) throw new Error('Document unavailable');
      const data = await response.json();
      const url = new URL(data.url);
      if (url.protocol !== 'https:') throw new Error('Invalid document URL');
      if (download) {
        const file = await fetch(url.href);
        if (!file.ok) throw new Error('Download unavailable');
        const objectUrl = URL.createObjectURL(await file.blob());
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else {
        window.location.assign(url.href);
      }
    } catch {
      setError("We couldn't open this document. Please try again or contact your manager.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="mt-2 flex flex-wrap gap-2">
    <button type="button" className="min-h-11 rounded border px-3 text-sm disabled:opacity-50" disabled={busy} onClick={() => void access(false)}>Open document</button>
    <button type="button" className="min-h-11 rounded border px-3 text-sm disabled:opacity-50" disabled={busy} onClick={() => void access(true)}>Download document</button>
    {error && <p role="alert" className="w-full text-sm text-rose-700">{error}</p>}
  </div>;
}
