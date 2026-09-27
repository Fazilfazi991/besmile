'use client';

import { useState } from 'react';
import {
  addStaffReportResponse,
  staffReportResponseError,
  staffReportResponseMaxLength,
  updateStaffReportResponse,
  type StaffReportSource,
} from '@/lib/staff-report-responses';

type Response = {
  id: string;
  responder_id: string;
  response_text: string;
  created_at: string;
  updated_at?: string;
  responder_profile?: { full_name?: string } | null;
};

export function StaffReportResponses({
  reportId,
  source,
  responses = [],
  viewer,
  ownerId,
  onChanged,
}: {
  reportId: string;
  source: StaffReportSource;
  responses?: Response[];
  viewer: { id: string; role?: string; full_name?: string };
  ownerId: string;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Response>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canParticipate = viewer.id === ownerId || viewer.role === 'director' || viewer.role === 'chairman';
  if (!canParticipate && !responses.length) return null;

  const close = () => { setOpen(false); setEditing(undefined); setText(''); setError(''); };
  const beginEdit = (response: Response) => { setEditing(response); setText(response.response_text); setOpen(true); setError(''); };
  const save = async () => {
    const validation = staffReportResponseError(text);
    if (validation) { setError(validation); return; }
    setBusy(true); setError('');
    try {
      if (editing) await updateStaffReportResponse(editing.id, text);
      else await addStaffReportResponse(source, reportId, viewer.id, text);
      close();
      await onChanged();
    } catch (cause: any) {
      setError(cause?.message || 'The private response could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="staff-report-responses mt-2 border-l-2 border-teal-100 pl-3">
    {responses.map(response => <div className="staff-report-response py-2 text-sm" key={response.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <b className="text-slate-800">{response.responder_profile?.full_name || 'Responder'}</b>
        <time className="text-[11px] text-slate-500" dateTime={response.created_at}>{new Date(response.created_at).toLocaleString()}</time>
      </div>
      <p className="whitespace-pre-wrap break-words text-slate-700 [overflow-wrap:anywhere]">{response.response_text}</p>
      {response.responder_id === viewer.id && <button type="button" className="mt-1 text-xs font-semibold text-teal-700" onClick={() => beginEdit(response)}>Edit response</button>}
    </div>)}
    {canParticipate && !open && <button type="button" className="staff-report-response-action mt-1 text-xs font-semibold text-teal-700" onClick={() => setOpen(true)}>Add Response / Reply</button>}
    {open && <div className="mt-2 space-y-2">
      <textarea
        className="input min-h-20 w-full resize-y text-sm"
        aria-label={editing ? 'Edit private response' : 'Private response'}
        autoFocus
        maxLength={staffReportResponseMaxLength}
        placeholder="Write a private response"
        value={text}
        onChange={event => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <small className="text-slate-500">Visible only to this staff member, Managing Director, and Chairman · {text.length}/{staffReportResponseMaxLength}</small>
        <div className="flex gap-2"><button type="button" className="btn border px-3 py-1 text-xs" disabled={busy} onClick={close}>Cancel</button><button type="button" className="btn btn-primary px-3 py-1 text-xs" disabled={busy || Boolean(staffReportResponseError(text))} onClick={() => void save()}>{busy ? 'Saving…' : editing ? 'Update response' : 'Save response'}</button></div>
      </div>
      {error && <p className="text-xs text-rose-700" role="alert">{error}</p>}
    </div>}
  </div>;
}
