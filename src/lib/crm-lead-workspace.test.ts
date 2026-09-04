import { describe, expect, it } from 'vitest';
import { crmFollowupState, filterCrmLeads } from './crm-lead-workspace';

const leads = [
  { id: '1', full_name: 'Sample Alpha', phone: '0501111111', status_id: 'new', source_id: 'web', assigned_to: 'staff-1', crm_lead_followups: [{ next_follow_up_at: '2026-09-04T09:00:00Z' }] },
  { id: '2', full_name: 'Sample Beta', email: 'beta@example.test', status_id: 'followup', source_id: 'phone', assigned_to: null, crm_lead_followups: [{ next_follow_up_at: '2026-09-03T09:00:00Z' }] },
];

describe('CRM lead workspace', () => {
  it('classifies the next follow-up relative to today', () => {
    expect(crmFollowupState(leads[0], '2026-09-04').label).toBe('Due today');
    expect(crmFollowupState(leads[1], '2026-09-04').label).toBe('Overdue');
    expect(crmFollowupState({ full_name: 'None' }, '2026-09-04').label).toBe('No follow-up');
  });

  it('combines real CRM filters without changing the record set', () => {
    const base = { status: '', source: '', assignee: '', followup: '', unassigned: false };
    expect(filterCrmLeads(leads, { ...base, query: '0501' }, '2026-09-04').map(item => item.id)).toEqual(['1']);
    expect(filterCrmLeads(leads, { ...base, query: '', followup: 'Overdue', unassigned: true }, '2026-09-04').map(item => item.id)).toEqual(['2']);
  });
});
