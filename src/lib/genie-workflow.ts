export type GenieActionType = 'lead' | 'task' | 'expense';
export type GenieChoice = { id: string; name: string };
export type GenieChoices = { sources?: GenieChoice[]; statuses?: GenieChoice[]; employees?: GenieChoice[]; accounts?: GenieChoice[]; categories?: GenieChoice[] };
const marketingExpenseTypes = ['Digital Marketing Expenses', 'Performance Marketing Expenses', 'Other Marketing Expenses'] as const;

export const confirmationWords = /^(?:confirm|save|create it|yes,? create|yes,? save)$/i;
export const cancellationWords = /^(?:cancel|never mind|nevermind|stop)$/i;
export const restartWords = /^(?:restart|start over|reset)$/i;

export function genieActionIntent(message: string): GenieActionType | null {
  const normalized = message.toLowerCase();
  const hasCreate = /\b(?:add|create|record|new|make)\b/.test(normalized);
  if (!hasCreate) return null;
  if (/\blead\b/.test(normalized)) return 'lead';
  if (/\btask\b/.test(normalized)) return 'task';
  if (/\bexpense\b/.test(normalized)) return 'expense';
  return null;
}

const isoDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? value : null;
};
const dateFrom = (message: string) => isoDate(message.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || '');
const choice = (value: string, choices: GenieChoice[] = []) => {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  const exact = choices.find(item => item.id === value || item.name.toLowerCase() === needle);
  if (exact) return exact.id;
  const matches = choices.filter(item => item.name.toLowerCase().includes(needle));
  return matches.length === 1 ? matches[0].id : null;
};

export function workflowDefaults(action: GenieActionType, actorId: string, today: string, choices: GenieChoices) {
  if (action === 'lead') return { lead_date: today, assigned_to: actorId, temperature: 'cold', status_id: choices.statuses?.[0]?.id || '' };
  if (action === 'task') return { priority: 'medium', assignee_ids: [] as string[] };
  return { transaction_date: today };
}

export function parseWorkflowInput(action: GenieActionType, message: string, current: Record<string, any>, choices: GenieChoices, focusedField?: string) {
  const next = { ...current };
  const text = message.trim();
  const lower = text.toLowerCase();
  const direct = focusedField ? text.replace(/^\s*(?:is|to)\s+/i, '').trim() : '';
  const date = dateFrom(text);

  if (action === 'lead') {
    const phone = text.match(/(?:phone|mobile|contact)?\s*[:#-]?\s*(\+?\d[\d ()-]{6,}\d)/i)?.[1];
    const name = text.match(/\blead(?:\s+(?:named|for))?\s+([a-z][a-z .'-]*?)(?=\s+(?:phone|mobile|contact|source|from|on|dated|assigned|status|temperature)\b|[,;]|$)/i)?.[1];
    if (name) next.full_name = name.trim();
    if (phone) next.phone = phone.replace(/[^\d+]/g, '');
    if (date) next.lead_date = date;
    const sourceName = text.match(/(?:source|from)\s+([a-z0-9 &_-]+?)(?=\s+(?:phone|on|dated|assigned|status|temperature)\b|[,;]|$)/i)?.[1];
    if (sourceName) next.source_id = choice(sourceName, choices.sources);
    const employeeName = text.match(/assigned(?:\s+to)?\s+([a-z .'-]+?)(?=[,;]|$)/i)?.[1];
    if (employeeName) next.assigned_to = choice(employeeName, choices.employees);
    const temperature = lower.match(/\b(cold|warm|hot)\b/)?.[1];
    if (temperature) next.temperature = temperature;
    if (focusedField === 'full_name') next.full_name = direct;
    if (focusedField === 'phone') next.phone = direct.replace(/[^\d+]/g, '');
    if (focusedField === 'lead_date' && isoDate(direct)) next.lead_date = direct;
    if (focusedField === 'source_id') next.source_id = choice(direct, choices.sources);
    if (focusedField === 'status_id') next.status_id = choice(direct, choices.statuses);
    if (focusedField === 'assigned_to') next.assigned_to = choice(direct, choices.employees);
  } else if (action === 'task') {
    const title = text.match(/\btask(?:\s+(?:called|titled|to))?\s+(.+?)(?=\s+(?:due|for|assign(?:ed)?|priority)\b|[,;]|$)/i)?.[1];
    if (title) next.title = title.trim().replace(/^['"]|['"]$/g, '');
    if (date) next.due_date = date;
    const priority = lower.match(/\b(low|medium|high)\b/)?.[1];
    if (priority) next.priority = priority;
    const employeeName = text.match(/(?:assign(?:ed)?\s+to|for)\s+([a-z .'-]+?)(?=\s+(?:due|priority)\b|[,;]|$)/i)?.[1];
    if (employeeName) { const id = choice(employeeName, choices.employees); if (id) next.assignee_ids = [id]; }
    if (focusedField === 'title') next.title = direct;
    if (focusedField === 'due_date' && isoDate(direct)) next.due_date = direct;
    if (focusedField === 'assignee_ids') { const id = choice(direct, choices.employees); if (id) next.assignee_ids = [id]; }
  } else {
    const amount = text.match(/(?:inr|rs\.?|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1];
    if (amount && Number(amount) > 0) next.amount = amount;
    if (date) next.transaction_date = date;
    const description = text.match(/\bexpense(?:\s+of\s+(?:inr|rs\.?|₹)?\s*[0-9.]+)?\s+(?:for|on)\s+(.+?)(?=\s+(?:account|category|paid|via|date)\b|[,;]|$)/i)?.[1];
    if (description) next.description = description.trim();
    const accountName = text.match(/account\s+([a-z0-9 &_-]+?)(?=\s+(?:category|paid|via|date)\b|[,;]|$)/i)?.[1];
    const categoryName = text.match(/category\s+([a-z0-9 &_-]+?)(?=\s+(?:account|paid|via|date)\b|[,;]|$)/i)?.[1];
    if (accountName) next.account_id = choice(accountName, choices.accounts);
    if (categoryName) {
      next.expense_category_id = choice(categoryName, choices.categories);
      next.expense_category_name = choices.categories?.find(item => item.id === next.expense_category_id)?.name || '';
    }
    const expenseSubtype = marketingExpenseTypes.find(type => lower.includes(type.toLowerCase()));
    if (expenseSubtype) next.expense_subcategory = expenseSubtype;
    const method = lower.match(/\b(cash|bank transfer|bank_transfer|upi|card)\b/)?.[1];
    if (method) next.payment_method = method.replace(' ', '_');
    if (focusedField === 'amount' && Number(direct) > 0) next.amount = String(Number(direct));
    if (focusedField === 'transaction_date' && isoDate(direct)) next.transaction_date = direct;
    if (focusedField === 'account_id') next.account_id = choice(direct, choices.accounts);
    if (focusedField === 'expense_category_id') {
      next.expense_category_id = choice(direct, choices.categories);
      next.expense_category_name = choices.categories?.find(item => item.id === next.expense_category_id)?.name || '';
    }
    if (focusedField === 'expense_subcategory') next.expense_subcategory = marketingExpenseTypes.find(type => type.toLowerCase() === direct.toLowerCase()) || '';
    if (focusedField === 'description') next.description = direct;
    if (focusedField === 'payment_method' && /^(cash|bank transfer|bank_transfer|upi|card)$/i.test(direct)) next.payment_method = direct.toLowerCase().replace(' ', '_');
  }
  return next;
}

export function missingWorkflowFields(action: GenieActionType, draft: Record<string, any>) {
  if (action === 'lead') return ['full_name','phone','lead_date','source_id','status_id','assigned_to'].filter(field => !draft[field]);
  if (action === 'task') return ['title','due_date','assignee_ids'].filter(field => field === 'assignee_ids' ? !draft.assignee_ids?.length : !draft[field]);
  const fields = ['amount','transaction_date','account_id','expense_category_id','payment_method'];
  if (draft.expense_category_name === 'Marketing') fields.push('expense_subcategory');
  if (draft.expense_subcategory === 'Other Marketing Expenses') fields.push('description');
  return fields.filter(field => !draft[field]);
}

const labels: Record<string,string> = { full_name:'client name',phone:'phone number',lead_date:'lead date (YYYY-MM-DD)',source_id:'lead source',status_id:'lead status',assigned_to:'assignee',title:'task title',due_date:'due date (YYYY-MM-DD)',assignee_ids:'assignee',amount:'amount',transaction_date:'expense date (YYYY-MM-DD)',account_id:'account',expense_category_id:'expense category',expense_subcategory:'Marketing expense type',description:'comment for Other Marketing Expenses',payment_method:'payment method (cash, bank transfer, UPI, or card)' };
export const workflowQuestion = (field: string, choices: GenieChoices) => {
  const list = field === 'source_id' ? choices.sources : field === 'status_id' ? choices.statuses : field === 'assigned_to' || field === 'assignee_ids' ? choices.employees : field === 'account_id' ? choices.accounts : field === 'expense_category_id' ? choices.categories : undefined;
  const fixed = field === 'expense_subcategory' ? marketingExpenseTypes : undefined;
  return `What ${labels[field] || field} should I use?${list?.length ? ` Choose: ${list.map(item => item.name).join(', ')}.` : fixed ? ` Choose: ${fixed.join(', ')}.` : ''}`;
};

export function workflowSummary(action: GenieActionType, draft: Record<string, any>, choices: GenieChoices) {
  const name = (items: GenieChoice[]|undefined,id: string) => items?.find(item => item.id===id)?.name || id;
  if (action==='lead') return `Lead: ${draft.full_name}\nPhone: ${draft.phone}\nDate: ${draft.lead_date}\nSource: ${name(choices.sources,draft.source_id)}\nStatus: ${name(choices.statuses,draft.status_id)}\nAssignee: ${name(choices.employees,draft.assigned_to)}\nTemperature: ${draft.temperature}`;
  if (action==='task') return `Task: ${draft.title}\nDue: ${draft.due_date}\nPriority: ${draft.priority}\nAssignee: ${name(choices.employees,draft.assignee_ids?.[0])}`;
  return `Expense: INR ${draft.amount}\nDate: ${draft.transaction_date}\nAccount: ${name(choices.accounts,draft.account_id)}\nCategory: ${name(choices.categories,draft.expense_category_id)}${draft.expense_subcategory ? `\nMarketing type: ${draft.expense_subcategory}` : ''}\nMethod: ${draft.payment_method}${draft.description ? `\nDescription: ${draft.description}` : ''}`;
}
