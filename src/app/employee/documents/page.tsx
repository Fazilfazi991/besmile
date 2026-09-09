'use client';

import { useEffect, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { documentFileAccept, documentFileValidationMessage } from '@/lib/document-file-rules';
import { EmployeeBanner, EmployeeEmptyState, EmployeeLoading, EmployeeMetric, EmployeeMetricGrid, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';

const toneFor = (status: string) => status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : status === 'submitted' ? 'info' : 'pending';

export default function DocumentsPage() {
  const [profile, setProfile] = useState<any>();
  const [documents, setDocuments] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const employee = (await currentProfile()) as any;
      if (!employee) throw Error('Your session has expired.');
      const [company, assigned] = await Promise.all([
        employeeRepository.companyDocuments(),
        employeeRepository.documentRequests(employee.id),
      ]);
      setProfile(employee); setDocuments(company); setRequests(assigned); setError('');
    } catch (caught: any) { setError(caught.message || 'Unable to load documents.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
  const open = async (path: string) => window.open(await employeeRepository.signedDocumentUrl(path), '_blank');
  const upload = async (requestId: string, file: File) => {
    try {
      const fileError = documentFileValidationMessage(file);
      if (fileError) throw Error(fileError);
      await employeeRepository.submitRequestedDocument(profile.id, requestId, file);
      setNotice('Document submitted for review.');
      await load();
    } catch (caught: any) {
      setError(caught.message || 'Unable to upload document.');
    }
  };

  if (loading) return <section><EmployeePageHeader title="Documents" subtitle="Company resources and requested documents." /><EmployeeLoading cards={2} /></section>;
  if (error && !profile) return <section><EmployeePageHeader title="Documents" subtitle="Company resources and requested documents." /><EmployeeBanner>{error}</EmployeeBanner><button className="btn btn-primary" onClick={load}>Try again</button></section>;
  const requested = requests.filter(item => item.status === 'requested').length;
  const submitted = requests.filter(item => item.status === 'submitted').length;
  const policies = documents.filter(item => String(item.category || '').toLowerCase().includes('policy'));
  const resources = documents.filter(item => !String(item.category || '').toLowerCase().includes('policy'));
  const renderDocuments = (items: any[]) => items.length ? <div className="divide-y divide-slate-100">{items.map(document => <article className="flex items-center justify-between gap-3 p-4" key={document.id}><div className="min-w-0"><b className="block truncate">{document.title}</b><p className="mt-1 text-sm text-slate-500">{document.category || 'Document'}</p></div>{document.storage_path && <button className="btn border shrink-0 px-3 py-1.5 text-xs" onClick={() => void open(document.storage_path)}>View</button>}</article>)}</div> : null;

  return <section className="space-y-4">
    <EmployeePageHeader title="Documents" subtitle="Company resources and requested documents." />
    <EmployeeMetricGrid columns={3}><EmployeeMetric label="Policies" value={policies.length} /><EmployeeMetric label="Requested from you" value={requested} tone="pending" /><EmployeeMetric label="In review" value={submitted} tone="info" /></EmployeeMetricGrid>
    {notice && <EmployeeBanner tone="success">{notice}</EmployeeBanner>}{error && <EmployeeBanner>{error}</EmployeeBanner>}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4"><EmployeeSection title="Policies" description="Published company policies shared with you.">
        {renderDocuments(policies) || <EmployeeEmptyState title="No published policies" detail="Applicable company policies will appear here when they are published and shared." />}
      </EmployeeSection><EmployeeSection title="Company documents" description="Forms, notices, and shared resources.">
        {renderDocuments(resources) || <EmployeeEmptyState title="No company documents" detail="Shared company resources will appear here." />}
      </EmployeeSection></div>
      <EmployeeSection title="Requested from you" description="Upload the documents your manager has requested.">
        {requests.length ? <div className="divide-y divide-slate-100">{requests.map(request => { const submission = request.document_submissions?.[0]; const canSubmit = request.status === 'requested' || request.status === 'rejected'; return <article className="space-y-3 p-4" key={request.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b>{request.title}</b>{request.description && <p className="mt-1 text-sm text-slate-500">{request.description}</p>}</div><EmployeeStatusBadge tone={toneFor(request.status) as any}>{request.status}</EmployeeStatusBadge></div>{request.admin_comment && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><b>Admin comment:</b> {request.admin_comment}</p>}<div className="flex flex-wrap gap-2">{submission && <button className="btn border px-3 py-1.5 text-xs" onClick={() => void open(submission.storage_path)}>View submission</button>}{canSubmit && <label className="btn border cursor-pointer px-3 py-1.5 text-xs">{submission ? 'Replace document' : 'Upload document'}<input className="hidden" type="file" accept={documentFileAccept} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(request.id, file); }} /></label>}</div></article>; })}</div> : <EmployeeEmptyState title="No document requests" detail="Requests assigned to you will appear here." />}
      </EmployeeSection>
    </div>
  </section>;
}
