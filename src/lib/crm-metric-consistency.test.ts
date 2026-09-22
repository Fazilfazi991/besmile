import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  crmDashboardPeriodRange,
  formatCrmConversionRate,
  type CrmDashboardSummary,
  type CrmDateRange,
} from './crm-dashboard-e1';
import { buildDirectorMetrics } from './director-executive-metrics';

type Lead = {
  lead_date: string;
  created_at: string;
  archived_at: string | null;
  converted_at: string | null;
  status: { name: string; sort_order: number };
  source: { name: string };
};

const leads: Lead[] = [
  { lead_date: '2026-09-22', created_at: '2026-09-01T08:00:00Z', archived_at: null, converted_at: '2026-09-22T09:00:00Z', status: { name: 'Converted', sort_order: 4 }, source: { name: 'Outdoor Marketing' } },
  { lead_date: '2026-09-21', created_at: '2026-09-22T08:00:00Z', archived_at: null, converted_at: null, status: { name: 'New', sort_order: 1 }, source: { name: 'Referral' } },
  { lead_date: '2026-09-01', created_at: '2026-08-10T08:00:00Z', archived_at: null, converted_at: '2026-09-10T09:00:00Z', status: { name: 'Converted', sort_order: 4 }, source: { name: 'Outdoor Marketing' } },
  { lead_date: '2026-09-10', created_at: '2026-09-11T08:00:00Z', archived_at: null, converted_at: null, status: { name: 'Contacted', sort_order: 2 }, source: { name: 'Website' } },
  { lead_date: '2026-09-05', created_at: '2026-09-05T08:00:00Z', archived_at: '2026-09-06T08:00:00Z', converted_at: null, status: { name: 'New', sort_order: 1 }, source: { name: 'Outdoor Marketing' } },
  { lead_date: '2026-08-31', created_at: '2026-09-22T08:00:00Z', archived_at: null, converted_at: null, status: { name: 'New', sort_order: 1 }, source: { name: 'Website' } },
];

function inRange(value: string | null, range: CrmDateRange) {
  const key = String(value || '').slice(0, 10);
  return key >= range.start && key <= range.end;
}

function canonicalSummary(range: CrmDateRange, rows = leads): CrmDashboardSummary {
  const visible = rows.filter(row => !row.archived_at);
  const period = visible.filter(row => inRange(row.lead_date, range));
  const converted = visible.filter(row => inRange(row.converted_at, range));
  const group = (key: 'status' | 'source') => [...period.reduce((map, row) => map.set(row[key].name, (map.get(row[key].name) || 0) + 1), new Map<string, number>())].map(([name, count]) => ({ name, count }));
  return {
    periodLeads: period.length,
    converted: converted.length,
    contacted: period.filter(row => /contact/i.test(row.status.name)).length,
    assessment: 0,
    daily: [],
    statuses: group('status'),
    sources: group('source'),
    followups: { due: 0, overdue: 0, upcoming: 0, completed: 0 },
    financeAllowed: true,
    revenue: 0,
    expenses: 0,
  };
}

function directorMetrics(range: CrmDateRange, summary: CrmDashboardSummary) {
  return buildDirectorMetrics({
    timezone: 'Asia/Kolkata',
    finance: { monthly: [] },
    leads: leads.filter(row => !row.archived_at),
    sales: [],
    invoices: [],
    summary: { todayLeads: canonicalSummary(crmDashboardPeriodRange('today', '2026-09-22')).periodLeads },
  }, range, summary, new Date('2026-09-22T12:00:00Z'));
}

describe('cross-dashboard CRM metric consistency', () => {
  const ranges: Record<string, CrmDateRange> = {
    Today: crmDashboardPeriodRange('today', '2026-09-22'),
    'This Week': crmDashboardPeriodRange('week', '2026-09-22'),
    'This Month': crmDashboardPeriodRange('month', '2026-09-22'),
    Custom: { start: '2026-09-01', end: '2026-09-10' },
  };

  it.each(Object.entries(ranges))('%s uses the CRM summary count and conversion formatting', (_label, range) => {
    const crm = canonicalSummary(range);
    const main = directorMetrics(range, crm);
    expect(main.periodLeadCount).toBe(crm.periodLeads);
    expect(formatCrmConversionRate({ periodLeads: main.periodLeadCount, converted: main.periodConvertedCount })).toBe(formatCrmConversionRate(crm));
  });

  it('uses lead_date rather than created_at, excludes archived leads, and includes custom boundaries', () => {
    expect(canonicalSummary(ranges.Today).periodLeads).toBe(1);
    expect(canonicalSummary(ranges['This Week']).periodLeads).toBe(2);
    expect(canonicalSummary(ranges['This Month']).periodLeads).toBe(4);
    expect(canonicalSummary(ranges.Custom).periodLeads).toBe(2);
    expect(canonicalSummary(ranges.Custom).sources).toContainEqual({ name: 'Outdoor Marketing', count: 1 });
  });

  it('formats 5 of 89 consistently and safely handles zero leads and conversions', () => {
    expect(formatCrmConversionRate({ periodLeads: 89, converted: 5 })).toBe('6%');
    expect(formatCrmConversionRate({ periodLeads: 0, converted: 0 })).toBe('0%');
    const empty = canonicalSummary(ranges.Custom, []);
    expect(directorMetrics(ranges.Custom, empty).periodLeadCount).toBe(0);
  });

  it('keeps both dashboards on the shared repository RPC and canonical formatter', () => {
    const main = readFileSync('src/components/director-executive-dashboard.tsx', 'utf8');
    const crm = readFileSync('src/app/admin/crm/page.tsx', 'utf8');
    expect(main).toContain('adminRepository.crmDashboardSummary(requestRange.start, requestRange.end)');
    expect(crm).toContain('adminRepository.crmDashboardSummary(requestRange.start, requestRange.end)');
    expect(main).toContain('formatCrmConversionRate(crmSummary)');
    expect(crm).toContain('formatCrmConversionRate(summary)');
    expect(main).toContain('label="Leads this period"');
    expect(main).toContain('label="Active Leads — All Time"');
  });
});
