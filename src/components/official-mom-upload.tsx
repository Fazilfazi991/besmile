'use client';

import { useRef, useState, type FormEvent } from 'react';
import { documentFileAccept, documentFileValidationMessage } from '@/lib/document-file-rules';
import { officialMomLabel, officialMomType } from '@/lib/official-mom';
import { supabase } from '@/lib/supabase';

export default function OfficialMomUpload({ onUploaded }: { onUploaded: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const payload = new FormData(form);
    const file = payload.get('file');
    const validation = file instanceof File ? documentFileValidationMessage(file) : 'Choose a file to upload.';
    setMessage(''); setError('');
    if (validation) { setError(validation); return; }
    submitting.current = true; setBusy(true);
    let storagePath = '';
    let saved = false;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Your session has expired.');
      storagePath = `company/${user.id}/mom/${crypto.randomUUID()}-${(file as File).name}`;
      const stored = await supabase.storage.from('employee-documents').upload(storagePath, file, { contentType: (file as File).type, upsert: false });
      if (stored.error) throw new Error('Unable to upload the MOM file. Please try again.');
      const response = await fetch('/api/documents/official/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: officialMomType, title: payload.get('title'), description: payload.get('description'), storagePath }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to upload MOM.');
      saved = true;
      form.reset();
      setMessage('Minutes of Meeting uploaded.');
      try { await onUploaded(); }
      catch { setError('MOM was saved, but the list could not refresh. Reload the page to see it.'); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to upload MOM.'); }
    finally {
      // RLS refuses removal once a document references the object, including
      // when a successful save's response was lost in transit.
      if (storagePath && !saved) await supabase.storage.from('employee-documents').remove([storagePath]).catch(() => undefined);
      submitting.current = false; setBusy(false);
    }
  };

  return <div className="space-y-3">
    <button type="button" className="btn border" aria-expanded={open} aria-controls="official-mom-upload" onClick={() => setOpen(!open)}>Upload Document</button>
    {open && <form id="official-mom-upload" className="card official-step official-mom-upload min-w-0" onSubmit={upload}>
      <h2 className="font-bold">Upload Document</h2>
      <label>Document type<select name="documentType" className="input min-w-0" defaultValue={officialMomType}><option value={officialMomType}>{officialMomLabel}</option></select></label>
      <label>Title<input name="title" required maxLength={140} className="input" /></label>
      <label>Description (optional)<textarea name="description" className="input" /></label>
      <label>File<input name="file" required type="file" accept={documentFileAccept} className="block w-full min-w-0 text-sm" /></label>
      <p className="text-xs text-slate-500">PDF, JPG, PNG, or WebP · max 10 MB</p>
      <button disabled={busy} className="btn btn-primary w-fit">{busy ? 'Uploading…' : 'Upload MOM'}</button>
      {(error || message) && <p role="status" className={`official-generator-message ${error ? 'is-error' : 'is-success'}`}>{error || message}</p>}
    </form>}
  </div>;
}
