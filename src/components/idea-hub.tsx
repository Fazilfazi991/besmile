'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { ideaAttachmentAccept, ideaStatuses, ideaStatusTone, type IdeaStatus } from '@/lib/idea-rules';
import { ideaRepository, type IdeaPayload } from '@/lib/idea-repository';
import { EmployeeBanner, EmployeeEmptyState, EmployeeLoading, EmployeeMetric, EmployeeMetricGrid, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';

const emptyForm: IdeaPayload = { title: '', problem_or_opportunity: '', proposed_solution: '', expected_benefit: '', category_id: '' };

const preview = (text: string) => text.length > 160 ? `${text.slice(0, 157)}...` : text;
const initials = (name?: string) => (name || 'B').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
const isManager = (profile: any) => ['super_admin', 'chairman', 'director', 'general_manager'].includes(profile?.role);
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const normalize = (value: unknown) => String(value || '').toLowerCase();

export function IdeaFeedPage({ mode }: { mode: 'employee' | 'admin' }) {
  const [profile, setProfile] = useState<any>(); const [ideas, setIdeas] = useState<any[]>([]); const [stats, setStats] = useState<any>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''); const [statusFilter, setStatusFilter] = useState(''); const [categoryFilter, setCategoryFilter] = useState(''); const [scope, setScope] = useState('all'); const [sort, setSort] = useState('newest');
  const load = useCallback(async () => { setLoading(true); try { const person = await currentProfile(); if (!person) throw new Error('Your session has expired.'); const [items, counts] = await Promise.all([ideaRepository.feed(), mode === 'admin' ? ideaRepository.stats() : Promise.resolve(null)]); setProfile(person); setIdeas(items); setStats(counts); setError(''); } catch (caught: any) { setError(caught.message || 'Unable to load Idea Hub.'); } finally { setLoading(false); } }, [mode]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const categories = useMemo(() => [...new Map(ideas.map(idea => [idea.category?.id || idea.category?.name || 'Other', idea.category?.name || 'Other'])).entries()], [ideas]);
  const visibleIdeas = useMemo(() => {
    const search = normalize(query);
    const filtered = ideas.filter(idea => {
      const supported = idea.supports?.some((support: any) => support.employee_id === profile?.id);
      const mine = idea.submitted_by === profile?.id;
      const matchesScope = scope === 'all' || (scope === 'mine' && mine) || (scope === 'supported' && supported);
      const matchesStatus = !statusFilter || idea.status === statusFilter;
      const matchesCategory = !categoryFilter || (idea.category?.id || idea.category?.name || 'Other') === categoryFilter;
      const searchable = [idea.title, idea.problem_or_opportunity, idea.proposed_solution, idea.expected_benefit, idea.category?.name, idea.submitter?.full_name, idea.submitter?.department?.name].map(normalize).join(' ');
      return matchesScope && matchesStatus && matchesCategory && (!search || searchable.includes(search));
    });
    return [...filtered].sort((left, right) => {
      if (sort === 'supported') return (right.supports?.length || 0) - (left.supports?.length || 0);
      if (sort === 'discussed') return (right.comments?.filter((comment: any) => !comment.is_deleted).length || 0) - (left.comments?.filter((comment: any) => !comment.is_deleted).length || 0);
      if (sort === 'oldest') return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }, [categoryFilter, ideas, profile?.id, query, scope, sort, statusFilter]);
  const support = async (idea: any) => { if (!profile) return; const old = ideas; setIdeas(current => current.map(item => item.id === idea.id ? { ...item, supports: idea.supports?.some((row: any) => row.employee_id === profile.id) ? item.supports.filter((row: any) => row.employee_id !== profile.id) : [...(item.supports || []), { id: `local-${Date.now()}`, employee_id: profile.id }] } : item)); try { await ideaRepository.toggleSupport(idea, profile.id); await load(); } catch (caught: any) { setIdeas(old); setError(caught.message || 'Unable to update support.'); } };
  if (loading) return <section><EmployeePageHeader title="Idea Hub" subtitle="Share practical improvements and support ideas from the team." /><EmployeeLoading cards={4} /></section>;
  return <section className="space-y-4">
    <EmployeePageHeader title="Idea Hub" subtitle="Share practical improvements and support ideas from the team." action={<div className="flex gap-2"><Link className="btn btn-primary" href={mode === 'admin' ? '/admin/ideas/new' : '/employee/ideas/new'}>Submit Idea</Link>{mode === 'admin' && <Link className="btn border" href="/admin/ideas/categories">Categories</Link>}</div>} />
    {error && <EmployeeBanner>{error}</EmployeeBanner>}
    {mode === 'admin' && stats && <EmployeeMetricGrid columns={6}><EmployeeMetric label="Total Ideas" value={stats.total} /><EmployeeMetric label="Submitted" value={stats.submitted} /><EmployeeMetric label="Under Review" value={stats.consideration} tone="info" /><EmployeeMetric label="Implemented" value={stats.implemented} tone="success" /><EmployeeMetric label="Total Supports" value={stats.supports} /><EmployeeMetric label="This Month" value={stats.thisMonth} tone="pending" /></EmployeeMetricGrid>}
    {mode === 'employee' && <EmployeeMetricGrid columns={3}><EmployeeMetric label="Ideas" value={ideas.length} /><EmployeeMetric label="Implemented" value={ideas.filter(item => item.status === 'Implemented').length} tone="success" /><EmployeeMetric label="Supports" value={ideas.reduce((sum, item) => sum + (item.supports?.length || 0), 0)} /></EmployeeMetricGrid>}
    <EmployeeSection title="Idea Space" description="Search, filter, and support practical ideas from across the team.">
      <div className="grid gap-3 border-b border-slate-100 p-4 lg:grid-cols-[minmax(240px,1fr)_160px_180px_150px]">
        <input aria-label="Search ideas" className="input" placeholder="Search title, benefit, category, or colleague" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="Status" className="input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option>{ideaStatuses.map(value => <option value={value} key={value}>{value}</option>)}</select>
        <select aria-label="Category" className="input" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>
        <select aria-label="Sort ideas" className="input" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest</option><option value="supported">Most supported</option><option value="discussed">Most discussed</option><option value="oldest">Oldest</option></select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {[['all', 'All Ideas'], ['mine', 'My Ideas'], ['supported', 'Supported']].map(([value, label]) => <button className={`rounded-full border px-3 py-2 text-xs font-bold ${scope === value ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`} key={value} onClick={() => setScope(value)} type="button">{label}</button>)}
        </div>
        <span className="text-slate-500">{visibleIdeas.length} of {ideas.length} ideas</span>
      </div>
      {visibleIdeas.length ? <div className="divide-y divide-slate-100">{visibleIdeas.map(idea => <IdeaCard key={idea.id} idea={idea} profile={profile} mode={mode} onSupport={() => void support(idea)} />)}</div> : <EmployeeEmptyState title={ideas.length ? 'No matching ideas' : 'No ideas yet'} detail={ideas.length ? 'Adjust the search or filters to widen the idea space.' : 'Be the first to submit an improvement idea.'} />}
    </EmployeeSection>
  </section>;
}

function IdeaCard({ idea, profile, mode, onSupport }: { idea: any; profile: any; mode: 'employee' | 'admin'; onSupport: () => void }) {
  const supported = idea.supports?.some((support: any) => support.employee_id === profile?.id);
  const href = `${mode === 'admin' ? '/admin' : '/employee'}/ideas/${idea.id}`;
  const comments = idea.comments?.filter((comment: any) => !comment.is_deleted).length || 0;
  return <article className="p-4 transition hover:bg-slate-50">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <Link href={href} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><EmployeeStatusBadge tone={ideaStatusTone(idea.status)}>{idea.status}</EmployeeStatusBadge><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">{idea.category?.name || 'Other'}</span></div>
        <h2 className="mt-3 text-lg font-bold text-slate-900">{idea.title}</h2>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{preview(idea.proposed_solution || '')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 font-bold text-slate-700">{initials(idea.submitter?.full_name)}</span><span>{idea.submitter?.full_name || 'Employee'}</span><span>{idea.submitter?.department?.name || 'No department'}</span><span>{date(idea.created_at)}</span><span>{comments} comments</span></div>
      </Link>
      <button className={`btn min-h-10 shrink-0 ${supported ? 'border border-teal-300 bg-teal-50 text-teal-800' : 'border'}`} onClick={onSupport} type="button">{supported ? 'Supported' : 'Support'} - {idea.supports?.length || 0}</button>
    </div>
  </article>;
}

export function IdeaFormPage({ mode }: { mode: 'employee' | 'admin' }) {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(); const [categories, setCategories] = useState<any[]>([]); const [form, setForm] = useState<IdeaPayload>(emptyForm); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => { const timer = setTimeout(async () => { try { const person = await currentProfile(); if (!person) throw new Error('Your session has expired.'); const active = await ideaRepository.categories(); setProfile(person); setCategories(active); setForm(current => ({ ...current, category_id: active[0]?.id || '' })); } catch (caught: any) { setError(caught.message || 'Unable to prepare the idea form.'); } finally { setLoading(false); } }, 0); return () => clearTimeout(timer); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!profile) return; setSaving(true); setError(''); try { const payload = new FormData(); Object.entries(form).forEach(([key, value]) => payload.set(key, value)); if (file) payload.set('file', file); const response = await fetch('/api/ideas/submit', { method: 'POST', body: payload }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to submit idea.'); setNotice('Idea submitted and published.'); router.push(`${mode === 'admin' ? '/admin' : '/employee'}/ideas/${body.id}`); } catch (caught: any) { setError(caught.message || 'Unable to submit idea.'); } finally { setSaving(false); } };
  if (loading) return <section><EmployeePageHeader title="Submit Idea" subtitle="Send a practical improvement to the Idea Hub." /><EmployeeLoading /></section>;
  return <section className="space-y-4"><EmployeePageHeader title="Submit Idea" subtitle="Ideas are published immediately after validation." />{notice && <EmployeeBanner tone="success">{notice}</EmployeeBanner>}{error && <EmployeeBanner>{error}</EmployeeBanner>}<EmployeeSection title="Idea Details" description="Keep it clear and specific so colleagues can understand and support it."><IdeaFields form={form} setForm={setForm} categories={categories} /><div className="border-t border-slate-100 p-4"><label className="text-sm font-semibold text-slate-700">Attachment <span className="font-normal text-slate-500">(optional)</span><input className="input mt-2" type="file" accept={ideaAttachmentAccept} onChange={event => setFile(event.target.files?.[0] || null)} /></label><p className="mt-2 text-xs text-slate-500">PDF, Word, Excel, PNG, or JPG. Maximum 20 MB.</p></div><div className="flex justify-end gap-2 border-t border-slate-100 p-4"><Link href={mode === 'admin' ? '/admin/ideas' : '/employee/ideas'} className="btn border">Cancel</Link><button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Submitting...' : 'Submit Idea'}</button></div></EmployeeSection></section>;
}

function IdeaFields({ form, setForm, categories }: { form: IdeaPayload; setForm: (value: IdeaPayload) => void; categories: any[] }) {
  return <form className="grid gap-4 p-4" onSubmit={event => event.preventDefault()}>
    <label className="text-sm font-semibold text-slate-700">Idea Title<input required minLength={5} maxLength={150} className="input mt-1" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
    <label className="text-sm font-semibold text-slate-700">Category<select required className="input mt-1" value={form.category_id} onChange={event => setForm({ ...form, category_id: event.target.value })}>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
    <label className="text-sm font-semibold text-slate-700">Problem or Opportunity<textarea required minLength={20} maxLength={3000} className="input mt-1 min-h-28" value={form.problem_or_opportunity} onChange={event => setForm({ ...form, problem_or_opportunity: event.target.value })} /></label>
    <label className="text-sm font-semibold text-slate-700">Proposed Idea or Solution<textarea required minLength={20} maxLength={5000} className="input mt-1 min-h-32" value={form.proposed_solution} onChange={event => setForm({ ...form, proposed_solution: event.target.value })} /></label>
    <label className="text-sm font-semibold text-slate-700">Expected Benefit<textarea required minLength={10} maxLength={3000} className="input mt-1 min-h-24" value={form.expected_benefit} onChange={event => setForm({ ...form, expected_benefit: event.target.value })} /></label>
  </form>;
}

export function IdeaDetailPage({ id, mode }: { id: string; mode: 'employee' | 'admin' }) {
  const [profile, setProfile] = useState<any>(); const [data, setData] = useState<any>(); const [categories, setCategories] = useState<any[]>([]); const [comment, setComment] = useState(''); const [replyTo, setReplyTo] = useState<string | null>(null); const [editing, setEditing] = useState(false); const [form, setForm] = useState<IdeaPayload>(emptyForm); const [status, setStatus] = useState<IdeaStatus>('Submitted'); const [note, setNote] = useState(''); const [response, setResponse] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const [person, detail, active] = await Promise.all([currentProfile(), ideaRepository.detail(id), ideaRepository.categories()]); if (!person) throw new Error('Your session has expired.'); setProfile(person); setData(detail); setCategories(active); setForm({ title: detail.idea.title, problem_or_opportunity: detail.idea.problem_or_opportunity, proposed_solution: detail.idea.proposed_solution, expected_benefit: detail.idea.expected_benefit, category_id: detail.idea.category_id }); setStatus(detail.idea.status); setNote(detail.idea.status_note || ''); setResponse(detail.idea.official_response || ''); setError(''); } catch (caught: any) { setError(caught.message || 'Unable to load idea.'); } finally { setLoading(false); } }, [id]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const idea = data?.idea; const comments = data?.comments || []; const roots = comments.filter((item: any) => !item.parent_comment_id); const replies = (parentId: string) => comments.filter((item: any) => item.parent_comment_id === parentId); const supported = idea?.supports?.some((support: any) => support.employee_id === profile?.id); const canEdit = profile?.id === idea?.submitted_by && idea?.status === 'Submitted';
  if (loading) return <section><EmployeePageHeader title="Idea Details" subtitle="Loading Idea Hub item." /><EmployeeLoading cards={3} /></section>;
  if (error && !idea) return <section><EmployeePageHeader title="Idea Details" subtitle="Idea Hub item." /><EmployeeBanner>{error}</EmployeeBanner></section>;
  const addComment = async () => { try { await ideaRepository.addComment(id, profile.id, comment, replyTo); setComment(''); setReplyTo(null); await load(); } catch (caught: any) { setError(caught.message || 'Unable to add comment.'); } };
  const saveEdit = async () => { try { await ideaRepository.updateIdea(id, form); setEditing(false); await load(); } catch (caught: any) { setError(caught.message || 'Unable to update idea.'); } };
  const changeStatus = async () => { try { await ideaRepository.changeStatus(id, status, note, response); await load(); } catch (caught: any) { setError(caught.message || 'Unable to change status.'); } };
  const openAttachment = async (attachment: any) => { const result = await fetch(`/api/ideas/${id}/attachments/${attachment.id}/signed-url`); const body = await result.json(); if (!result.ok) { setError(body.error || 'Unable to open attachment.'); return; } window.open(body.url, '_blank', 'noopener,noreferrer'); };
  return <section className="space-y-4">
    <EmployeePageHeader title={idea.title} subtitle={`${idea.category?.name || 'Other'} - ${date(idea.created_at)}`} action={<Link className="btn border" href={mode === 'admin' ? '/admin/ideas' : '/employee/ideas'}>Back</Link>} />
    {error && <EmployeeBanner>{error}</EmployeeBanner>}
    <EmployeeMetricGrid columns={3}><EmployeeMetric label="Status" value={<EmployeeStatusBadge tone={ideaStatusTone(idea.status)}>{idea.status}</EmployeeStatusBadge>} /><EmployeeMetric label="Supports" value={idea.supports?.length || 0} /><EmployeeMetric label="Comments" value={comments.filter((item: any) => !item.is_deleted).length} /></EmployeeMetricGrid>
    <EmployeeSection title="Idea" description={`${idea.submitter?.full_name || 'Employee'} - ${idea.submitter?.department?.name || 'No department'}`} action={canEdit && !editing ? <button className="btn border" onClick={() => setEditing(true)}>Edit</button> : undefined}>
      {editing ? <><IdeaFields form={form} setForm={setForm} categories={categories} /><div className="flex justify-end gap-2 border-t border-slate-100 p-4"><button className="btn border" onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary" onClick={saveEdit}>Save Idea</button></div></> : <div className="grid gap-4 p-4 text-sm leading-6 text-slate-700"><Block label="Problem or Opportunity" value={idea.problem_or_opportunity} /><Block label="Proposed Idea or Solution" value={idea.proposed_solution} /><Block label="Expected Benefit" value={idea.expected_benefit} />{idea.official_response && <Block label="Official Management Response" value={idea.official_response} />}</div>}
    </EmployeeSection>
    <EmployeeSection title="Engagement" action={<button className={`btn ${supported ? 'border border-teal-300 bg-teal-50 text-teal-800' : 'border'}`} onClick={async () => { await ideaRepository.toggleSupport(idea, profile.id); await load(); }}>{supported ? 'Supported' : 'Support'} - {idea.supports?.length || 0}</button>}>
      <div className="border-t border-slate-100 p-4"><textarea className="input min-h-24" placeholder={replyTo ? 'Write a reply' : 'Add a comment'} value={comment} onChange={event => setComment(event.target.value)} /><div className="mt-2 flex justify-end gap-2">{replyTo && <button className="btn border" onClick={() => setReplyTo(null)}>Cancel reply</button>}<button className="btn btn-primary" onClick={addComment}>Post</button></div></div>
      <div className="divide-y divide-slate-100">{roots.map((item: any) => <CommentThread key={item.id} item={item} replies={replies(item.id)} profile={profile} onReply={() => setReplyTo(item.id)} onDeleted={load} />)}{!roots.length && <EmployeeEmptyState title="No comments yet" detail="Start the discussion with a clear note or question." />}</div>
    </EmployeeSection>
    {data.attachments.length > 0 && <EmployeeSection title="Attachment" description="Private file access uses a short-lived signed URL."><div className="divide-y divide-slate-100">{data.attachments.map((attachment: any) => <button className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm hover:bg-slate-50" onClick={() => void openAttachment(attachment)} key={attachment.id}><span><b>{attachment.original_file_name}</b><small className="block text-slate-500">{attachment.file_extension.toUpperCase()} - {Math.ceil(attachment.file_size / 1024)} KB</small></span><span className="font-semibold text-teal-700">Open</span></button>)}</div></EmployeeSection>}
    {mode === 'admin' && isManager(profile) && <EmployeeSection title="Management" description="Change progress status or add an official response."><div className="grid gap-3 p-4 md:grid-cols-3"><select className="input" value={status} onChange={event => setStatus(event.target.value as IdeaStatus)}>{ideaStatuses.map(value => <option key={value}>{value}</option>)}</select><input className="input" placeholder={status === 'Not Proceeding' ? 'Reason required' : 'Status note'} value={note} onChange={event => setNote(event.target.value)} /><input className="input" placeholder="Official response" value={response} onChange={event => setResponse(event.target.value)} /></div><div className="flex justify-end border-t border-slate-100 p-4"><button className="btn btn-primary" onClick={changeStatus}>Update Status</button></div></EmployeeSection>}
    <EmployeeSection title="Status History"><div className="divide-y divide-slate-100">{data.history.map((row: any) => <p className="p-4 text-sm" key={row.id}><b>{row.new_status}</b><span className="text-slate-500"> from {row.previous_status || 'created'} by {row.actor?.full_name || 'System'} on {new Date(row.created_at).toLocaleString()}</span>{row.reason && <span className="block text-slate-600">{row.reason}</span>}</p>)}</div></EmployeeSection>
    <EmployeeSection title="Activity"><div className="divide-y divide-slate-100">{data.activity.map((row: any) => <p className="p-4 text-sm capitalize" key={row.id}>{row.action_type.replaceAll('_', ' ')} <span className="text-slate-500">- {row.actor?.full_name || 'System'} - {new Date(row.created_at).toLocaleString()}</span></p>)}</div></EmployeeSection>
  </section>;
}

function Block({ label, value }: { label: string; value: string }) {
  return <div><h3 className="font-bold text-slate-900">{label}</h3><p className="mt-1 whitespace-pre-wrap">{value}</p></div>;
}

function CommentThread({ item, replies, profile, onReply, onDeleted }: { item: any; replies: any[]; profile: any; onReply: () => void; onDeleted: () => void }) {
  if (item.is_deleted) return <p className="p-4 text-sm text-slate-500">Comment deleted.</p>;
  return <div className="p-4"><Comment item={item} profile={profile} onReply={onReply} onDeleted={onDeleted} />{replies.length > 0 && <div className="mt-3 space-y-3 border-l border-slate-200 pl-4">{replies.map(reply => reply.is_deleted ? <p className="text-sm text-slate-500" key={reply.id}>Reply deleted.</p> : <Comment item={reply} profile={profile} onReply={onReply} onDeleted={onDeleted} key={reply.id} />)}</div>}</div>;
}

function Comment({ item, profile, onReply, onDeleted }: { item: any; profile: any; onReply: () => void; onDeleted: () => void }) {
  return <article><div className="flex items-start gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{initials(item.author?.full_name)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{item.author?.full_name || 'Employee'}</b>{item.is_official_response && <EmployeeStatusBadge tone="info">Official</EmployeeStatusBadge>}<small className="text-slate-500">{new Date(item.created_at).toLocaleString()}</small></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p><div className="mt-2 flex gap-3 text-xs"><button className="font-semibold text-teal-700" onClick={onReply}>Reply</button>{item.author_employee_id === profile?.id && <button className="font-semibold text-rose-700" onClick={async () => { await ideaRepository.deleteComment(item.id, profile.id); onDeleted(); }}>Delete</button>}</div></div></div></article>;
}

export function IdeaCategoriesPage() {
  const [profile, setProfile] = useState<any>(); const [items, setItems] = useState<any[]>([]); const [form, setForm] = useState({ id: '', name: '', description: '', sort_order: 100, is_active: true }); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const [person, categories] = await Promise.all([currentProfile(), ideaRepository.categories(true)]); if (!person) throw new Error('Your session has expired.'); setProfile(person); setItems(categories); setError(''); } catch (caught: any) { setError(caught.message || 'Unable to load categories.'); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await ideaRepository.saveCategory({ ...form, actorId: profile.id }); setForm({ id: '', name: '', description: '', sort_order: 100, is_active: true }); await load(); } catch (caught: any) { setError(caught.message || 'Unable to save category.'); } };
  if (loading) return <section><EmployeePageHeader title="Idea Categories" subtitle="Manage Idea Hub category options." /><EmployeeLoading /></section>;
  return <section className="space-y-4"><EmployeePageHeader title="Idea Categories" subtitle="Add, update, reorder, activate, or deactivate submission categories." action={<Link className="btn border" href="/admin/ideas">Ideas</Link>} />{error && <EmployeeBanner>{error}</EmployeeBanner>}<EmployeeSection title={form.id ? 'Edit Category' : 'Add Category'}><form className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_120px_140px_auto]" onSubmit={submit}><input required className="input" placeholder="Category name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /><input className="input" placeholder="Description" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /><input className="input" type="number" value={form.sort_order} onChange={event => setForm({ ...form, sort_order: Number(event.target.value) })} /><label className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={event => setForm({ ...form, is_active: event.target.checked })} /> Active</label><button className="btn btn-primary">{form.id ? 'Save' : 'Add'}</button></form></EmployeeSection><EmployeeSection title="Categories" description="Used categories are deactivated instead of deleted."><div className="divide-y divide-slate-100">{items.map(category => <article className="flex flex-wrap items-center justify-between gap-3 p-4" key={category.id}><div><b>{category.name}</b><p className="text-sm text-slate-500">{category.description || 'No description'} - {category.ideas?.[0]?.count || 0} ideas - order {category.sort_order}</p></div><div className="flex items-center gap-2"><EmployeeStatusBadge tone={category.is_active ? 'success' : 'default'}>{category.is_active ? 'Active' : 'Inactive'}</EmployeeStatusBadge><button className="btn border" onClick={() => setForm({ id: category.id, name: category.name, description: category.description || '', sort_order: category.sort_order, is_active: category.is_active })}>Edit</button></div></article>)}</div></EmployeeSection></section>;
}
