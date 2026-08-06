import { describe, expect, it } from 'vitest';
import { ideaStatuses, validateIdeaAttachment, validateIdeaPayload, validateIdeaStatusChange } from './idea-rules';

const payload = {
  title: 'Monthly knowledge sharing',
  problem_or_opportunity: 'Team knowledge is often trapped in one department and repeated questions slow down new staff.',
  proposed_solution: 'Create a monthly internal session where employees share workflows, patient service lessons, and tool tips.',
  expected_benefit: 'Employees learn faster and repeated manual guidance reduces.',
  category_id: 'category-id',
};

describe('Innovation Hub rules', () => {
  it('keeps the allowed status workflow narrow', () => {
    expect(ideaStatuses).toEqual(['Submitted', 'Under Consideration', 'Implemented', 'On Hold', 'Not Proceeding', 'Archived']);
    expect(ideaStatuses).not.toContain('Pending Approval');
    expect(ideaStatuses).not.toContain('Approved');
    expect(ideaStatuses).not.toContain('Rejected');
  });

  it('validates the required submission fields without cost or timeline fields', () => {
    expect(validateIdeaPayload(payload)).toBeNull();
    expect(validateIdeaPayload({ ...payload, title: 'Idea' })).toBe('Idea title must be 5 to 150 characters.');
    expect(Object.keys(payload)).not.toContain('estimated_cost');
    expect(Object.keys(payload)).not.toContain('expected_timeline');
  });

  it('requires a reason only for Not Proceeding', () => {
    expect(validateIdeaStatusChange('Under Consideration', '')).toBeNull();
    expect(validateIdeaStatusChange('Not Proceeding', '')).toBe('Add a reason between 5 and 1,000 characters.');
    expect(validateIdeaStatusChange('Not Proceeding', 'Not aligned with current operations.')).toBeNull();
  });

  it('accepts safe attachment types and blocks executable names', () => {
    expect(validateIdeaAttachment({ name: 'workflow.pdf', type: 'application/pdf', size: 1024 })).toBeNull();
    expect(validateIdeaAttachment({ name: 'workflow.exe', type: 'application/x-msdownload', size: 1024 })).toBe('Upload a PDF, Word, Excel, PNG, or JPG file.');
    expect(validateIdeaAttachment({ name: 'workflow.exe.pdf', type: 'application/pdf', size: 1024 })).toBe('Attachment filename contains an unsafe embedded extension.');
  });
});
