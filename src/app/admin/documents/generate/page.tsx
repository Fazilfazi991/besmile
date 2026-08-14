'use client';

import { useEffect, useMemo, useState } from 'react';
import { offerLetterBody, officialDocumentTypes, type OfficialDocumentInput, type OfficialDocumentType } from '@/lib/official-document-types';

type Employee = { id: string; full_name: string; designation?: string | null; joining_date?: string | null; department?: { name?: string } | null };
type HistoryItem = { id: string; title: string; category: string; file_name: string; created_at: string; storage_path: string };
type Context = { profile: { full_name?: string; designation?: string }; employees: Employee[]; history: HistoryItem[] };

const today = new Date().toISOString().slice(0, 10);
const initialForm: OfficialDocumentInput = {
  documentType: 'offer_letter',
  issueDate: today,
  title: '',
  relatedName: '',
  relatedProfileId: '',
  position: '',
  department: '',
  joiningDate: '',
  compensation: '',
  policyCategory: '',
  customHeading: '',
  signatoryName: '',
  signatoryTitle: '',
  body: '',
};

function templateBody(type: OfficialDocumentType, name = '', position = '', joiningDate = '') {
  if (type === 'offer_letter') return offerLetterBody(name, position, joiningDate);
  if (type === 'policy') return '1. Purpose\n\nDescribe the purpose of this policy.\n\n2. Scope\n\nState who and what this policy applies to.\n\n3. Policy statement\n\nEnter the approved policy requirements and responsibilities here.';
  return 'Enter the official document content here. Separate paragraphs with a blank line for clean pagination.';
}

export default function OfficialDocumentGeneratorPage() {
  const [context, setContext] = useState<Context | null>(null);
  const [form, setForm] = useState<OfficialDocumentInput>({ ...initialForm, body: templateBody('offer_letter') });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'preview' | 'generate' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewPages, setPreviewPages] = useState(0);

  const loadContext = async () => {
    const response = await fetch('/api/documents/official/context', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load the document generator.');
    setContext(data);
    setForm((current) => ({
      ...current,
      signatoryName: current.signatoryName || data.profile?.full_name || '',
      signatoryTitle: current.signatoryTitle || data.profile?.designation || '',
    }));
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContext().catch((caught) => setError(caught.message)).finally(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const config = useMemo(() => officialDocumentTypes.find((item) => item.key === form.documentType)!, [form.documentType]);
  const update = (key: keyof OfficialDocumentInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const changeType = (documentType: OfficialDocumentType) => {
    setForm((current) => ({
      ...initialForm,
      documentType,
      issueDate: current.issueDate,
      signatoryName: current.signatoryName,
      signatoryTitle: current.signatoryTitle,
      title: documentType === 'policy' ? 'Company Policy' : '',
      body: templateBody(documentType),
    }));
    setError('');
    setNotice('');
  };
  const selectEmployee = (id: string) => {
    const employee = context?.employees.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      relatedProfileId: id,
      relatedName: employee?.full_name || '',
      position: employee?.designation || '',
      department: employee?.department?.name || '',
      joiningDate: employee?.joining_date || '',
      body: current.documentType === 'offer_letter' ? templateBody('offer_letter', employee?.full_name, employee?.designation || '', employee?.joining_date || '') : current.body,
    }));
  };

  const generate = async (mode: 'preview' | 'generate') => {
    if (busy) return;
    setBusy(mode); setError(''); setNotice(mode === 'preview' ? 'Preparing preview...' : 'Generating and securing PDF...');
    try {
      const response = await fetch('/api/documents/official/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, mode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Document generation failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewPages(Number(response.headers.get('X-Document-Pages') || 0));
      const filename = decodeURIComponent(response.headers.get('X-Document-Filename') || 'BSmile_Official_Document.pdf');
      const documentId = response.headers.get('X-Document-Id') || '';
      if (mode === 'generate') {
        const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
        if (documentId) await fetch('/api/documents/official/audit-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId }) });
        await loadContext();
        setNotice(`Download ready: ${filename}`);
      } else setNotice('Preview ready. This is the same PDF that will be downloaded.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Document generation failed.');
      setNotice('');
    } finally { setBusy(''); }
  };

  const openHistory = async (item: HistoryItem) => {
    setError('');
    try {
      await fetch('/api/documents/official/audit-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: item.id }) });
      const { employeeRepository } = await import('@/lib/employee-repository');
      const url = await employeeRepository.signedDocumentUrl(item.storage_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { setError('Unable to open the saved document.'); }
  };

  if (loading) return <div className="dashboard-progress"><span />Loading official document generator...</div>;
  if (!context) return <p className="rounded bg-rose-50 p-4 text-rose-800">{error || 'The official document generator is unavailable.'}</p>;

  return <section className="official-generator space-y-5">
    <header className="official-generator-header">
      <div><p className="eyebrow">DOCUMENT MANAGEMENT</p><h1>Official Document Generator</h1><p>Create sharp, searchable A4 PDFs on the approved BSmile letterhead.</p></div>
      <span>Authorized users only</span>
    </header>
    {(error || notice) && <div role="status" aria-live="polite" className={`official-generator-message ${error ? 'is-error' : 'is-success'}`}>{error || notice}</div>}

    <div className="official-generator-layout">
      <div className="official-generator-form space-y-4">
        <article className="card official-step"><Step number="1" title="Select document type" /><label>Document type<select className="input" value={form.documentType} onChange={(event) => changeType(event.target.value as OfficialDocumentType)}>{officialDocumentTypes.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label><div className="official-auto-heading"><small>Automatic heading</small><b>{form.documentType === 'custom_official_document' ? form.customHeading || 'Enter a custom heading below' : config.heading}</b></div>{form.documentType === 'custom_official_document' && <label>Custom heading<input required className="input" maxLength={80} value={form.customHeading || ''} onChange={(event) => update('customHeading', event.target.value)} /></label>}</article>

        <article className="card official-step"><Step number="2" title="Related record" />{form.documentType === 'offer_letter' && <label>Select employee (optional)<select className="input" value={form.relatedProfileId || ''} onChange={(event) => selectEmployee(event.target.value)}><option value="">Enter candidate manually</option>{context.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}{employee.designation ? ` - ${employee.designation}` : ''}</option>)}</select></label>}<div className="official-field-grid"><label>{config.relatedLabel}<input className="input" value={form.relatedName || ''} onChange={(event) => update('relatedName', event.target.value)} /></label><label>Date of issue<input required type="date" className="input" value={form.issueDate} onChange={(event) => update('issueDate', event.target.value)} /></label>{form.documentType === 'offer_letter' ? <><label>Position / designation<input required className="input" value={form.position || ''} onChange={(event) => update('position', event.target.value)} /></label><label>Department<input className="input" value={form.department || ''} onChange={(event) => update('department', event.target.value)} /></label><label>Joining date<input required type="date" className="input" value={form.joiningDate || ''} onChange={(event) => update('joiningDate', event.target.value)} /></label><label>Compensation (authorized use only)<input className="input" value={form.compensation || ''} onChange={(event) => update('compensation', event.target.value)} placeholder="Optional" /></label></> : <><label className="official-span-2">Document title<input required className="input" maxLength={140} value={form.title || ''} onChange={(event) => update('title', event.target.value)} /></label>{form.documentType === 'policy' && <label className="official-span-2">Policy category<input className="input" value={form.policyCategory || ''} onChange={(event) => update('policyCategory', event.target.value)} placeholder="e.g. Human Resources" /></label>}</>}</div></article>

        <article className="card official-step"><Step number="3" title="Document content" /><label>Official content<textarea required className="input official-content-input" maxLength={30000} value={form.body} onChange={(event) => update('body', event.target.value)} /></label><small className="official-help">Use blank lines between paragraphs. Long content paginates automatically without crossing the branded footer.</small><div className="official-field-grid"><label>Authorized signatory<input className="input" value={form.signatoryName || ''} onChange={(event) => update('signatoryName', event.target.value)} /></label><label>Signatory title<input className="input" value={form.signatoryTitle || ''} onChange={(event) => update('signatoryTitle', event.target.value)} /></label></div></article>

        <article className="card official-actions"><div><b>Steps 4 & 5 - Preview and generate</b><p>Preview renders the exact PDF file. Generation stores an auditable private copy.</p></div><div><button className="btn border" disabled={Boolean(busy)} onClick={() => void generate('preview')}>{busy === 'preview' ? 'Preparing preview...' : 'Preview PDF'}</button><button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void generate('generate')}>{busy === 'generate' ? 'Generating...' : 'Generate & download'}</button></div></article>
      </div>

      <aside className="official-preview-column"><div className="official-preview-toolbar"><div><b>A4 PDF preview</b><small>{previewPages ? `${previewPages} page${previewPages === 1 ? '' : 's'}` : 'No preview generated'}</small></div>{previewUrl && <a className="btn border" href={previewUrl} target="_blank" rel="noreferrer">Open</a>}</div><div className="official-preview-frame">{previewUrl ? <iframe title="Official document PDF preview" src={previewUrl} /> : <div><img src="/documents/letterhead/BSmile_Letterhead_Blank_A4_300dpi.png" alt="BSmile official letterhead preview" /><span>Select your content, then preview the PDF.</span></div>}</div></aside>
    </div>

    <article className="card official-history"><div><h2>Generated document history</h2><p>Private copies stored through the existing Documents storage controls.</p></div>{context.history.length ? <div>{context.history.map((item) => <button type="button" key={item.id} onClick={() => void openHistory(item)}><span><b>{item.title}</b><small>{item.category.replace('Official:', '')} - {new Date(item.created_at).toLocaleString()}</small></span><strong>Open</strong></button>)}</div> : <p className="official-history-empty">No official documents have been generated yet.</p>}</article>
  </section>;
}

function Step({ number, title }: { number: string; title: string }) { return <div className="official-step-heading"><span>{number}</span><h2>{title}</h2></div>; }
