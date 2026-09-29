import { describe, expect, it } from 'vitest';
import {
  genieActionIntent,
  missingWorkflowFields,
  parseWorkflowInput,
  resolveWorkflowFieldInput,
  workflowDefaults,
  workflowResolutionQuestion,
} from './genie-workflow';

const choices = {
  sources: [{ id: 'source-web', name: 'Website' }],
  statuses: [{ id: 'status-new', name: 'New' }],
  employees: [{ id: 'employee-1', name: 'Asha Kumar' }],
  accounts: [{ id: 'cash-account', name: 'Cash' }, { id: 'account-1', name: 'Primary Bank' }],
  categories: [
    { id: 'admin-category', name: 'Admin & Utilities' },
    { id: 'category-1', name: 'Marketing' },
    { id: 'monthly-category', name: 'Monthly Expenses' },
  ],
};

describe('Genie action workflow parsing', () => {
  it('routes mixed greetings to actions instead of small talk', () => {
    expect(genieActionIntent('Hi, add a lead')).toBe('lead');
    expect(genieActionIntent('Hello, create a task')).toBe('task');
    expect(genieActionIntent('Good morning, record an expense')).toBe('expense');
  });

  it('does not turn greeting plus policy questions into actions', () => {
    expect(genieActionIntent('Hello, what is the leave policy?')).toBeNull();
  });

  it('does not accept a normalized but impossible calendar date', () => {
    const draft = parseWorkflowInput('task', 'create task Prepare report due 2026-02-30 assigned to Asha Kumar', workflowDefaults('task', 'employee-1', '2026-09-28', choices), choices);
    expect(missingWorkflowFields('task', draft)).toContain('due_date');
  });

  it('captures lead details supplied in the first message and reports only missing fields', () => {
    const draft = parseWorkflowInput('lead', 'Hi, add a lead named Noor Ali phone +971 50 123 4567 from Website', workflowDefaults('lead', 'employee-1', '2026-09-28', choices), choices);
    expect(draft).toMatchObject({ full_name: 'Noor Ali', phone: '+971501234567', source_id: 'source-web', status_id: 'status-new', assigned_to: 'employee-1' });
    expect(missingWorkflowFields('lead', draft)).toEqual([]);
  });

  it('parses canonical task assignee IDs and explicit dates', () => {
    const draft = parseWorkflowInput('task', 'create task Prepare report assigned to Asha Kumar due 2026-10-02 high priority', workflowDefaults('task', 'employee-1', '2026-09-28', choices), choices);
    expect(draft).toMatchObject({ title: 'Prepare report', due_date: '2026-10-02', priority: 'high', assignee_ids: ['employee-1'] });
    expect(missingWorkflowFields('task', draft)).toEqual([]);
  });

  it('keeps expense account and category relationships as IDs', () => {
    const draft = parseWorkflowInput('expense', 'record expense INR 500 for ad printing account Primary Bank category Marketing paid by UPI Digital Marketing Expenses', workflowDefaults('expense', 'employee-1', '2026-09-28', choices), choices);
    expect(draft).toMatchObject({ amount: '500', account_id: 'account-1', expense_category_id: 'category-1', expense_subcategory: 'Digital Marketing Expenses', payment_method: 'upi' });
    expect(missingWorkflowFields('expense', draft)).toEqual([]);
  });

  it('asks for the approved subtype and comment required by the manual Marketing expense flow', () => {
    const draft = parseWorkflowInput('expense', 'record expense INR 500 account Primary Bank category Marketing paid by cash', workflowDefaults('expense', 'employee-1', '2026-09-28', choices), choices);
    expect(missingWorkflowFields('expense', draft)).toContain('expense_subcategory');
    const other = parseWorkflowInput('expense', 'Other Marketing Expenses', draft, choices, 'expense_subcategory');
    expect(missingWorkflowFields('expense', other)).toContain('description');
  });

  it.each(['bank', 'bank account', 'bannk', 'bnk'])('resolves %s to the sole authorized production bank account', input => {
    const result = resolveWorkflowFieldInput('expense', 'account_id', input, choices);
    expect(result).toMatchObject({ status: 'match', option: { id: 'account-1', name: 'Primary Bank' }, patch: { account_id: 'account-1' } });
  });

  it('maps the approved online-marketing alias to the existing Marketing ID and canonical subtype', () => {
    const result = resolveWorkflowFieldInput('expense', 'expense_category_id', 'online marketing', choices);
    expect(result).toMatchObject({
      status: 'match',
      option: { name: 'Digital Marketing Expenses' },
      patch: { expense_category_id: 'category-1', expense_category_name: 'Marketing', expense_subcategory: 'Digital Marketing Expenses' },
    });
  });

  it.each(['digial marketing', 'digital marketng'])('tolerates a safe Marketing subtype typo: %s', input => {
    expect(resolveWorkflowFieldInput('expense', 'expense_category_id', input, choices)).toMatchObject({
      status: 'match',
      patch: { expense_category_id: 'category-1', expense_subcategory: 'Digital Marketing Expenses' },
    });
  });

  it('keeps an ambiguous bank answer on the same slot and offers the actual options', () => {
    const twoBanks = { ...choices, accounts: [{ id: 'hdfc', name: 'HDFC Bank' }, { id: 'sbi', name: 'SBI Bank' }] };
    const result = resolveWorkflowFieldInput('expense', 'account_id', 'bank', twoBanks);
    expect(result?.status).toBe('ambiguous');
    if (result?.status === 'ambiguous') expect(workflowResolutionQuestion('account_id', result)).toBe('Did you mean HDFC Bank or SBI Bank?');
  });

  it('explains a no-match answer with authorized choices and does not advance', () => {
    const result = resolveWorkflowFieldInput('expense', 'account_id', 'xyzxyz', choices);
    expect(result?.status).toBe('no_match');
    if (result?.status === 'no_match') {
      expect(workflowResolutionQuestion('account_id', result)).toBe("I couldn't identify the account. You can choose Cash or Primary Bank.");
    }
    const unchanged = parseWorkflowInput('expense', 'xyzxyz', workflowDefaults('expense', 'employee-1', '2026-09-28', choices), choices, 'account_id');
    expect(missingWorkflowFields('expense', unchanged)).toContain('account_id');
  });

  it('interprets payment-method shorthand in the active payment-method context', () => {
    expect(resolveWorkflowFieldInput('expense', 'payment_method', 'bank', choices)).toMatchObject({
      status: 'match',
      option: { name: 'Bank transfer' },
      patch: { payment_method: 'bank_transfer' },
    });
  });

  it('completes a multi-turn expense with canonical IDs and values only', () => {
    let draft: Record<string, any> = workflowDefaults('expense', 'employee-1', '2026-09-28', choices);
    draft = parseWorkflowInput('expense', '1500', draft, choices, 'amount');
    for (const [field, input] of [['expense_category_id', 'online marketing'], ['account_id', 'bank'], ['payment_method', 'cash']] as const) {
      const result = resolveWorkflowFieldInput('expense', field, input, choices);
      expect(result?.status).toBe('match');
      if (result?.status === 'match') draft = { ...draft, ...result.patch };
    }
    expect(draft).toMatchObject({
      amount: '1500',
      transaction_date: '2026-09-28',
      expense_category_id: 'category-1',
      expense_subcategory: 'Digital Marketing Expenses',
      account_id: 'account-1',
      payment_method: 'cash',
    });
    expect(missingWorkflowFields('expense', draft)).toEqual([]);
  });
});
