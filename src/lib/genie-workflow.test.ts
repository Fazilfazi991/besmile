import { describe, expect, it } from 'vitest';
import { genieActionIntent, missingWorkflowFields, parseWorkflowInput, workflowDefaults } from './genie-workflow';

const choices = {
  sources: [{ id: 'source-web', name: 'Website' }],
  statuses: [{ id: 'status-new', name: 'New' }],
  employees: [{ id: 'employee-1', name: 'Asha Kumar' }],
  accounts: [{ id: 'account-1', name: 'Main Bank' }],
  categories: [{ id: 'category-1', name: 'Marketing' }],
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
    const draft = parseWorkflowInput('expense', 'record expense INR 500 for ad printing account Main Bank category Marketing paid by UPI Digital Marketing Expenses', workflowDefaults('expense', 'employee-1', '2026-09-28', choices), choices);
    expect(draft).toMatchObject({ amount: '500', account_id: 'account-1', expense_category_id: 'category-1', expense_subcategory: 'Digital Marketing Expenses', payment_method: 'upi' });
    expect(missingWorkflowFields('expense', draft)).toEqual([]);
  });

  it('asks for the approved subtype and comment required by the manual Marketing expense flow', () => {
    const draft = parseWorkflowInput('expense', 'record expense INR 500 account Main Bank category Marketing paid by cash', workflowDefaults('expense', 'employee-1', '2026-09-28', choices), choices);
    expect(missingWorkflowFields('expense', draft)).toContain('expense_subcategory');
    const other = parseWorkflowInput('expense', 'Other Marketing Expenses', draft, choices, 'expense_subcategory');
    expect(missingWorkflowFields('expense', other)).toContain('description');
  });
});
