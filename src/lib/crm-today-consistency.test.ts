import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDirectorMetrics } from './director-executive-metrics';

const adminRepository = readFileSync('src/lib/admin-repository.ts', 'utf8');
const crmDashboard = readFileSync('src/app/admin/crm/page.tsx', 'utf8');
const directorDashboard = readFileSync('src/components/director-executive-dashboard.tsx', 'utf8');
const managementDashboard = readFileSync('src/app/admin/page.tsx', 'utf8');

describe('CRM Today consistency', () => {
  it('uses the canonical CRM summary for CRM, Director, and GM Today values', () => {
    expect(crmDashboard).toContain('adminRepository.crmDashboardSummary(requestRange.start, requestRange.end)');
    expect(adminRepository).toContain('const crmToday=currentCrmBusinessDate()');
    expect(adminRepository).toContain('this.crmDashboardSummary(crmToday,crmToday)');
    expect(adminRepository).toContain('todayLeads:Number(todayLeadSummary?.periodLeads||0)');
    expect(adminRepository).not.toContain(".eq('lead_date',today).is('archived_at',null)");
    expect(readFileSync('src/lib/director-executive-metrics.ts', 'utf8')).toContain('todayLeads: Number(data.summary?.todayLeads || 0)');
    expect(managementDashboard).toContain("label=\"Today's Leads\"");
  });

  it('keeps selected-period current-stage counts separate from Today\'s Leads', () => {
    const metrics = buildDirectorMetrics({
      timezone: 'Asia/Kolkata',
      finance: { monthly: [] },
      sales: [],
      invoices: [],
      summary: { todayLeads: 14 },
      leads: [
        { lead_date: '2026-09-02', status: { name: 'New', sort_order: 1 } },
        { lead_date: '2026-09-03', status: { name: 'New', sort_order: 1 } },
        { lead_date: '2026-09-04', status: { name: 'Follow-up', sort_order: 3 } },
        { lead_date: '2026-08-31', status: { name: 'New', sort_order: 1 } },
      ],
    }, 'month', new Date('2026-09-20T12:00:00Z'));

    expect(metrics.todayLeads).toBe(14);
    expect(metrics.periodLeadCount).toBe(3);
    expect(metrics.pipeline.find(row => row.name === 'New')?.count).toBe(2);
    expect(directorDashboard).toContain('title="Leads by current stage"');
  });
});
