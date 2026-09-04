export type CrmLeadFilters = {
  query: string;
  status: string;
  source: string;
  assignee: string;
  followup: string;
  unassigned: boolean;
};

export type CrmLeadRecord = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  status_id?: string | null;
  source_id?: string | null;
  assigned_to?: string | null;
  crm_lead_followups?: Array<{ next_follow_up_at?: string | null }> | null;
};

export function crmFollowupState(lead: CrmLeadRecord, today: string) {
  const dates = (lead.crm_lead_followups || []).map(item => item.next_follow_up_at).filter(Boolean).sort() as string[];
  const next = dates[0] || '';
  const day = next.slice(0, 10);
  if (!next) return { label: 'No follow-up', date: '' };
  if (day < today) return { label: 'Overdue', date: next };
  if (day === today) return { label: 'Due today', date: next };
  return { label: 'Upcoming', date: next };
}

export function filterCrmLeads<T extends CrmLeadRecord>(leads: T[], filters: CrmLeadFilters, today: string) {
  const query = filters.query.trim().toLocaleLowerCase();
  return leads.filter(lead => {
    if (query && ![lead.full_name, lead.phone, lead.email].some(value => String(value || '').toLocaleLowerCase().includes(query))) return false;
    if (filters.status && lead.status_id !== filters.status) return false;
    if (filters.source && lead.source_id !== filters.source) return false;
    if (filters.assignee && lead.assigned_to !== filters.assignee) return false;
    if (filters.followup && crmFollowupState(lead, today).label !== filters.followup) return false;
    if (filters.unassigned && lead.assigned_to) return false;
    return true;
  });
}
