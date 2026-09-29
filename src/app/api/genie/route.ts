import { NextResponse } from 'next/server';
import { canUseGenie } from '@/lib/genie-access';
import { genieConversationReply } from '@/lib/genie-conversation';
import { answerPolicyQuestion } from '@/lib/genie-policy';
import {
  cancellationWords, confirmationWords, genieActionIntent, missingWorkflowFields,
  parseWorkflowInput, restartWords, workflowDefaults, workflowQuestion, workflowSummary,
  type GenieActionType, type GenieChoices,
} from '@/lib/genie-workflow';
import { serverSupabase } from '@/lib/supabase-server';
import { authorizationRead, AuthorizationUnavailable } from '@/lib/authorization-transport';
import { isManagementRole } from '@/lib/permission-access';

export const dynamic = 'force-dynamic';
const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function choicesFor(db: any, action: GenieActionType): Promise<GenieChoices> {
  if (action === 'lead') {
    const [sources, statuses, employees] = await Promise.all([
      db.from('crm_lead_sources').select('id,name').eq('is_active', true).order('name'),
      db.from('crm_lead_statuses').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
      db.rpc('organization_directory'),
    ]);
    if (sources.error || statuses.error || employees.error) throw new Error('Authorized lead choices are unavailable.');
    return { sources: sources.data || [], statuses: statuses.data || [], employees: (employees.data || []).map((item: any) => ({ id: item.id, name: item.full_name })) };
  }
  if (action === 'task') {
    const employees = await db.rpc('organization_directory');
    if (employees.error) throw new Error('Authorized assignees are unavailable.');
    return { employees: (employees.data || []).map((item: any) => ({ id: item.id, name: item.full_name })) };
  }
  const [accounts, categories] = await Promise.all([
    db.from('finance_accounts').select('id,name').eq('is_active', true).order('name'),
    db.from('finance_expense_categories').select('id,name').eq('is_active', true).order('name'),
  ]);
  if (accounts.error || categories.error) throw new Error('Authorized Finance choices are unavailable.');
  return { accounts: accounts.data || [], categories: categories.data || [] };
}

const resultLink = (action: GenieActionType, id: string, profile: any) => {
  const employeeWorkspace = profile.is_employee && profile.role !== 'super_admin' && !isManagementRole(profile.role);
  if (action === 'lead') return employeeWorkspace ? `/employee/crm/leads/${id}` : `/admin/crm/leads/${id}`;
  if (action === 'task') return employeeWorkspace ? '/employee/tasks' : '/admin/tasks';
  return '/admin/finance/expenses';
};

export async function POST(request: Request) {
  try {
    const db: any = await serverSupabase();
    const session = await authorizationRead<any>(() => db.auth.getUser(), 'genie.session', true);
    const user = session.data.user;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders });

    const profileResult = await authorizationRead<any>(
      signal => db.from('profiles').select('id,status,is_employee,role,onboarding_required').eq('id', user.id).abortSignal(signal).maybeSingle(),
      'genie.profile',
    );
    const profile = profileResult.data;
    if (!canUseGenie(profile)) return NextResponse.json({ error: 'Genie is available to active BSmile employees only.' }, { status: 403, headers: responseHeaders });
    if (profile.onboarding_required) return NextResponse.json({ error: 'Complete secure onboarding before using Genie.' }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as { question?: unknown; conversationId?: unknown } | null;
    if (!body || typeof body.question !== 'string' || !body.question.trim()) return NextResponse.json({ error: 'Enter a message.' }, { status: 400, headers: responseHeaders });
    if (body.question.length > 400) return NextResponse.json({ error: 'Keep messages under 400 characters.' }, { status: 400, headers: responseHeaders });
    const question = body.question.trim();
    const conversationId = typeof body.conversationId === 'string' && uuid.test(body.conversationId) ? body.conversationId : null;

    let active: any = null;
    if (conversationId) {
      const activeResult = await db.from('genie_workflow_drafts').select('*').eq('actor_id', user.id).eq('conversation_id', conversationId).in('status', ['draft','awaiting_confirmation']).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (activeResult.error) throw activeResult.error;
      active = activeResult.data;
    }

    // A network timeout can hide a successful confirmation from the browser. Keep
    // the completed draft addressable so an explicit retry returns the original
    // result instead of falling through to policy search or creating a duplicate.
    if (!active && conversationId && confirmationWords.test(question)) {
      const completedResult = await db.from('genie_workflow_drafts').select('*').eq('actor_id', user.id).eq('conversation_id', conversationId).eq('status', 'completed').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (completedResult.error) throw completedResult.error;
      const completed = completedResult.data;
      if (completed) {
        const action = completed.action_type as GenieActionType;
        const saved = await db.rpc('confirm_genie_action', { target_draft: completed.id, expected_version: completed.version, expected_confirmation_token: null, request_key: completed.idempotency_key });
        if (saved.error) throw saved.error;
        const row = Array.isArray(saved.data) ? saved.data[0] : saved.data;
        const href = resultLink(action, row.result_id, profile);
        return NextResponse.json({ status: 'conversation', answer: `Already saved ${action} ${row.result_id}.`, sources: [], created: { type: action, id: row.result_id, href } }, { headers: responseHeaders });
      }
    }

    if (active) {
      const action = active.action_type as GenieActionType;
      const choices = await choicesFor(db, action);
      if (cancellationWords.test(question)) {
        const cancelled = await db.rpc('cancel_genie_workflow_draft', { target_draft: active.id, expected_version: active.version });
        if (cancelled.error) throw cancelled.error;
        return NextResponse.json({ status: 'conversation', answer: 'Cancelled. No record was created.', sources: [] }, { headers: responseHeaders });
      }
      if (restartWords.test(question)) {
        const cancelled = await db.rpc('cancel_genie_workflow_draft', { target_draft: active.id, expected_version: active.version });
        if (cancelled.error) throw cancelled.error;
        return NextResponse.json({ status: 'conversation', answer: `Restarted the ${action} workflow. Tell me the details you want to use.`, sources: [] }, { headers: responseHeaders });
      }
      if (confirmationWords.test(question)) {
        if (active.status !== 'awaiting_confirmation' || active.missing_fields?.length) return NextResponse.json({ status: 'conversation', answer: workflowQuestion(active.missing_fields?.[0], choices), sources: [] }, { headers: responseHeaders });
        const saved = await db.rpc('confirm_genie_action', { target_draft: active.id, expected_version: active.version, expected_confirmation_token: active.confirmation_token, request_key: active.idempotency_key });
        if (saved.error) throw saved.error;
        const row = Array.isArray(saved.data) ? saved.data[0] : saved.data;
        const href = resultLink(action, row.result_id, profile);
        return NextResponse.json({ status: 'conversation', answer: `${row.replayed ? 'Already saved' : 'Created'} ${action} ${row.result_id}.`, sources: [], created: { type: action, id: row.result_id, href } }, { headers: responseHeaders });
      }

      const aliases: Record<string,string> = { name:'full_name',phone:'phone',date:action==='task'?'due_date':action==='expense'?'transaction_date':'lead_date',source:'source_id',status:'status_id',assignee:action==='task'?'assignee_ids':'assigned_to',title:'title',priority:'priority',amount:'amount',account:'account_id',category:'expense_category_id','marketing type':'expense_subcategory',description:'description',method:'payment_method' };
      const edit = question.match(/^change\s+([a-z ]+?)\s+to\s+(.+)$/i);
      const focused = edit ? aliases[edit[1].trim().toLowerCase().replace('due ','')] : active.missing_fields?.[0];
      const input = edit ? edit[2] : question;
      const draft = parseWorkflowInput(action, input, active.draft || {}, choices, focused);
      const missing = missingWorkflowFields(action, draft);
      const confirmationToken = missing.length ? null : crypto.randomUUID();
      const updated = await db.rpc('update_genie_workflow_draft', {
        target_draft: active.id,
        expected_version: active.version,
        draft_payload: draft,
        draft_missing_fields: missing,
        target_confirmation_token: confirmationToken,
      });
      if (updated.error) throw updated.error;
      const answer = missing.length ? workflowQuestion(missing[0], choices) : `${workflowSummary(action, draft, choices)}\n\nReply “confirm” to save, “change … to …” to edit, or “cancel”.`;
      return NextResponse.json({ status: 'conversation', answer, sources: [] }, { headers: responseHeaders });
    }

    const intent = genieActionIntent(question);
    if (intent) {
      if (!conversationId) return NextResponse.json({ error: 'Restart Genie to begin a secure action workflow.' }, { status: 400, headers: responseHeaders });
      const choices = await choicesFor(db, intent);
      const defaults = workflowDefaults(intent, user.id, today(), choices);
      const draft = parseWorkflowInput(intent, question, defaults, choices);
      const missing = missingWorkflowFields(intent, draft);
      const confirmationToken = missing.length ? null : crypto.randomUUID();
      const inserted = await db.rpc('start_genie_workflow_draft', {
        target_conversation: conversationId,
        target_action_type: intent,
        draft_payload: draft,
        draft_missing_fields: missing,
        target_confirmation_token: confirmationToken,
      });
      if (inserted.error) throw inserted.error;
      const answer = missing.length ? workflowQuestion(missing[0], choices) : `${workflowSummary(intent, draft, choices)}\n\nReply “confirm” to save, “change … to …” to edit, or “cancel”.`;
      return NextResponse.json({ status: 'conversation', answer, sources: [] }, { headers: responseHeaders });
    }

    const conversation = genieConversationReply(question);
    if (conversation) return NextResponse.json({ status: 'conversation', answer: conversation, sources: [] }, { headers: responseHeaders });
    return NextResponse.json(answerPolicyQuestion(question), { headers: responseHeaders });
  } catch (error) {
    const unavailable = error instanceof AuthorizationUnavailable;
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    const safeErrors: Record<string, { status: number; message: string }> = {
      '42501': { status: 403, message: 'You do not have permission to complete that Genie action.' },
      'P0002': { status: 404, message: 'That workflow record is no longer available.' },
      '40001': { status: 409, message: 'This workflow changed. Review the latest summary and try again.' },
      '23505': { status: 409, message: 'A conflicting record already exists.' },
      '22023': { status: 409, message: 'The workflow details are invalid or no longer current.' },
    };
    const safe = safeErrors[code];
    const status = unavailable ? 503 : safe?.status || 503;
    const detail = typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message || '') : '';
    console.error('Genie request failed', { kind: unavailable ? 'authorization_unavailable' : 'request_failed', code, message: detail || 'unknown' });
    return NextResponse.json({ error: unavailable ? 'Access verification is temporarily unavailable. Please try again.' : safe?.message || 'Genie is temporarily unavailable. Please try again.' }, { status, headers: responseHeaders });
  }
}
