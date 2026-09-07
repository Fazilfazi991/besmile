import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const page = readFileSync('src/app/admin/page.tsx', 'utf8');
describe('dashboard KPI factual visuals', () => {
  it('keeps KPI values intact and derives compact visuals from live summary and finance data', () => {
    expect(page).toContain('value: summary.employees');
    expect(page).toContain('value: summary.presentToday');
    expect(page).toContain('(summary.newLeads || 0) / summary.leads');
    expect(page).toContain('monthly.income / Math.max(monthly.income, monthly.previousIncome)');
    expect(page).toContain('<KpiFactBar percent={kpi.visual}');
    expect(page).not.toContain('dummy');
  });
});
