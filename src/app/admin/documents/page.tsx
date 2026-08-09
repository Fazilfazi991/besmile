'use client';

import { FormEvent, useEffect, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { adminRepository } from '@/lib/admin-repository';
import { documentFileAccept, documentFileValidationMessage } from '@/lib/document-file-rules';
import { documentExpiryLabel, documentExpiryState } from '@/lib/document-expiry-rules';

export default function AdminDocumentsPage() {
  const [profile, setProfile] = useState<any>();
  const [staff, setStaff] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [staffQuery, setStaffQuery] = useState('');
  const [share, setShare] = useState({ title: '', description: '', category: 'Policy', expiry_date: '', profileIds: [] as string[] });
  const [request, setRequest] = useState({ title: '', description: '', due_date: '', profile_id: '' });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const current = await currentProfile() as any;
      if (!current || !['super_admin', 'chairman', 'director', 'general_manager'].includes(current.role)) throw Error('You do not have permission to manage documents.');
      const [employees, shared, requested] = await Promise.all([
        adminRepository.employees('', 0, 100),
        adminRepository.documents(),
        adminRepository.documentRequests(),
      ]);
      setProfile(current);
      setStaff(employees.data);
      setDocuments(shared);
      setRequests(requested);
      setError('');
    } catch (caught: any) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (!file) throw Error('Choose a file to upload.');
      const fileError = documentFileValidationMessage(file);
      if (fileError) throw Error(fileError);
      const stored = await adminRepository.uploadCompanyDocument(profile.id, file);
      await adminRepository.createCompanyDocument({
        ...share,
        storage_path: stored.path,
        file_name: stored.fileName,
        mime_type: stored.mimeType,
        file_size: stored.fileSize,
        uploaded_by: profile.id,
      });
      setFile(null);
      setShare({ title: '', description: '', category: 'Policy', expiry_date: '', profileIds: [] });
      await load();
    } catch (caught: any) {
      setError(caught.message);
    }
  };

  const createRequest = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await adminRepository.requestDocument({ ...request, requested_by: profile.id });
      setRequest({ title: '', description: '', due_date: '', profile_id: '' });
      await load();
    } catch (caught: any) {
      setError(caught.message);
    }
  };

  const open = async (path: string) => window.open(await (await import('@/lib/employee-repository')).employeeRepository.signedDocumentUrl(path), '_blank');

  if (loading) return <p>Loading documents…</p>;
  if (error && !profile) return <p className="text-rose-700">{error}</p>;

  return <section className="space-y-6">
    <div><h1 className="text-2xl font-bold">Document Management</h1><p className="text-slate-600">Share company documents and review employee submissions.</p></div>
    {error && <p className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={upload} className="card space-y-3 p-5">
        <h2 className="font-bold">Upload company document</h2>
        <input required className="input" placeholder="Title" value={share.title} onChange={event => setShare({ ...share, title: event.target.value })} />
        <textarea className="input" placeholder="Short description" value={share.description} onChange={event => setShare({ ...share, description: event.target.value })} />
        <select className="input" value={share.category} onChange={event => setShare({ ...share, category: event.target.value })}>{['Policy', 'Form', 'Notice', 'HR', 'Finance', 'Other'].map(category => <option key={category}>{category}</option>)}</select>
        <label className="text-sm text-slate-600">Expiry date (optional)<input type="date" className="input mt-1" value={share.expiry_date} onChange={event => setShare({ ...share, expiry_date: event.target.value })} /></label>
        <div className="document-recipient-picker"><input className="input" placeholder="Search employees to share with" value={staffQuery} onChange={event => setStaffQuery(event.target.value)} /><div className="document-recipient-options">{staff.filter(employee => employee.full_name.toLowerCase().includes(staffQuery.toLowerCase())).slice(0, 12).map(employee => <label key={employee.id}><input type="checkbox" checked={share.profileIds.includes(employee.id)} onChange={() => setShare(current => ({ ...current, profileIds: current.profileIds.includes(employee.id) ? current.profileIds.filter(id => id !== employee.id) : [...current.profileIds, employee.id] }))} /><span>{employee.full_name}</span><small>{employee.designation || 'Employee'}</small></label>)}</div></div>
        <p className="text-xs text-slate-500">Leave staff selection empty to share with everyone.</p>
        <label className="document-upload-control"><input required type="file" accept={documentFileAccept} onChange={event => setFile(event.target.files?.[0] || null)} /><span>⇧</span><b>{file ? file.name : 'Choose a file'}</b><small>{file ? `${Math.ceil(file.size / 1024)} KB · Change file` : 'PDF, JPG, PNG, or WebP · max 10 MB'}</small></label>
        <button className="btn btn-primary">Upload and share</button>
      </form>
      <form onSubmit={createRequest} className="card space-y-3 p-5">
        <h2 className="font-bold">Request a document</h2>
        <input required className="input" placeholder="Requested document" value={request.title} onChange={event => setRequest({ ...request, title: event.target.value })} />
        <textarea className="input" placeholder="Short instructions" value={request.description} onChange={event => setRequest({ ...request, description: event.target.value })} />
        <input type="date" className="input" value={request.due_date} onChange={event => setRequest({ ...request, due_date: event.target.value })} />
        <select required className="input" value={request.profile_id} onChange={event => setRequest({ ...request, profile_id: event.target.value })}><option value="">Select employee</option>{staff.map(employee => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select>
        <button className="btn btn-primary">Send request</button>
      </form>
    </div>
    <div className="card overflow-hidden"><h2 className="border-b p-5 font-bold">Company documents</h2>{documents.map(document => { const expiry = documentExpiryLabel(document.expiry_date); const tone = documentExpiryState(document.expiry_date); return <div className="flex justify-between border-b p-4" key={document.id}><span><b>{document.title}</b><small className="ml-2 text-slate-500">{document.category}</small>{expiry && <small className={`ml-2 ${tone === 'expired' ? 'text-rose-700' : tone === 'valid' ? 'text-emerald-700' : 'text-amber-700'}`}>{expiry}</small>}<p className="text-sm text-slate-600">{document.description}</p></span><button className="text-sm underline" onClick={() => void open(document.storage_path)}>Preview / download</button></div>; })}</div>
    <div className="card overflow-hidden"><h2 className="border-b p-5 font-bold">Employee submissions</h2>{requests.map(item => <article className="border-b p-4" key={item.id}><div className="flex flex-wrap justify-between gap-3"><div><b>{item.title}</b><p className="text-sm text-slate-600">{item.employee?.full_name} · {item.status}</p>{item.document_submissions?.[0] && <button className="mt-2 text-sm underline" onClick={() => void open(item.document_submissions[0].storage_path)}>Preview / download submission</button>}</div>{item.status === 'submitted' && <div className="space-y-2"><input className="rounded border p-2 text-sm" placeholder="Optional review comment" value={comments[item.id] || ''} onChange={event => setComments({ ...comments, [item.id]: event.target.value })} /><div className="flex gap-2"><button onClick={async () => { await adminRepository.reviewDocumentRequest(item.id, 'approved', comments[item.id] || '', profile.id); await load(); }} className="rounded border px-3 py-2 text-sm">Approve</button><button onClick={async () => { await adminRepository.reviewDocumentRequest(item.id, 'rejected', comments[item.id] || '', profile.id); await load(); }} className="rounded border border-rose-300 px-3 py-2 text-sm text-rose-700">Reject</button></div></div>}</div></article>)}{!requests.length && <p className="p-5 text-slate-600">No document requests yet.</p>}</div>
  </section>;
}
