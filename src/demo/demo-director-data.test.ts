import { describe, expect, it } from 'vitest';
import { demoDirectorCrmSummary, demoDirectorDashboardData } from './demo-director-data';
import { currentCrmBusinessDate, crmDashboardPeriodRange, normalizeCrmDashboardSummary } from '@/lib/crm-dashboard-e1';
import { buildDirectorMetrics } from '@/lib/director-executive-metrics';

describe('fictional Director dashboard data', () => {
  it('provides consistent current-period metrics without database access', () => {
    for (const period of ['today', 'week', 'month'] as const) {
      const range = crmDashboardPeriodRange(period);
      const summary = normalizeCrmDashboardSummary(demoDirectorCrmSummary(range.start, range.end), range);
      const metrics = buildDirectorMetrics(demoDirectorDashboardData, range, summary);
      expect(metrics.periodLeadCount).toBeGreaterThan(0);
      expect(metrics.revenue).toBeGreaterThan(0);
      expect(metrics.outstanding).toBeGreaterThan(0);
    }
    expect(demoDirectorDashboardData.summary.todayLeads).toBeGreaterThan(0);
  });
  it('returns a valid empty summary for dates outside fictional fixtures', () => {
    const range = { start: '2000-01-01', end: '2000-01-31' };
    expect(normalizeCrmDashboardSummary(demoDirectorCrmSummary(range.start, range.end), range).periodLeads).toBe(0);
    expect(demoDirectorDashboardData.leads.every(lead => lead.lead_date <= currentCrmBusinessDate())).toBe(true);
  });
});
