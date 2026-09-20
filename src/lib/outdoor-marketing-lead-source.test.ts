import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveCrmLeadSource } from './crm-lead-source';

const migration = readFileSync('supabase/migrations/20260920151439_add_outdoor_marketing_source.sql', 'utf8');
const sourceFoundation = readFileSync('supabase/migrations/0013_leads_sales_crm.sql', 'utf8');

describe('Outdoor Marketing lead source', () => {
  it('adds and reactivates one canonical lookup row idempotently', () => {
    expect(sourceFoundation).toContain('name text not null unique');
    expect(migration).toContain("values ('Outdoor Marketing', true)");
    expect(migration).toContain('on conflict (name) do update');
    expect(migration).toContain('set is_active = true');
    expect(migration).not.toMatch(/alter table|update\s+public\.crm_leads/i);
  });

  it('resolves imports case-insensitively instead of falling back to Other', () => {
    const sources = [
      { id: 'outdoor', name: 'Outdoor Marketing' },
      { id: 'other', name: 'Other' },
    ];
    expect(resolveCrmLeadSource(sources, ' outdoor MARKETING ')).toEqual(sources[0]);
    expect(resolveCrmLeadSource(sources, 'Unknown source')).toEqual(sources[1]);
  });

  it('keeps create, edit, filters, sales, reports, and charts data-driven', () => {
    const files = {
      adminWorkspace: readFileSync('src/components/crm-lead-management.tsx', 'utf8'),
      adminEdit: readFileSync('src/app/admin/crm/leads/[id]/page.tsx', 'utf8'),
      employeeWorkspace: readFileSync('src/app/employee/crm/leads/page.tsx', 'utf8'),
      employeeEdit: readFileSync('src/app/employee/crm/leads/[id]/page.tsx', 'utf8'),
      sales: readFileSync('src/app/admin/crm/sales/page.tsx', 'utf8'),
      reports: readFileSync('src/components/operational-reports.tsx', 'utf8'),
      dashboardRpc: readFileSync('supabase/migrations/20260813094151_performance_batch_one.sql', 'utf8'),
    };

    expect(files.adminWorkspace.match(/lookups\.sources\.map/g)?.length).toBeGreaterThanOrEqual(2);
    expect(files.adminEdit).toContain('lookups.sources.map');
    expect(files.employeeWorkspace.match(/lookups\.sources\.map/g)?.length).toBeGreaterThanOrEqual(2);
    expect(files.employeeEdit).toContain('lookups.sources.map');
    expect(files.sales).toContain('adminRepository.crmLookups()');
    expect(files.sales).toContain('setSources(lookups.sources.map');
    expect(files.reports).toContain('source:crm_lead_sources(name)');
    expect(files.dashboardRpc).toContain("'sources', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)");
  });
});
