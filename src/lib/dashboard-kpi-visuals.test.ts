import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const page = readFileSync('src/app/admin/page.tsx', 'utf8');
describe('dashboard KPI factual visuals', () => {
  it('keeps KPI values intact and derives compact visuals from live summary and finance data', () => {
    expect(page).toContain('value: summary.employees');
    expect(page).toContain('value: summary.presentToday');
    expect(page).toContain('operationalKpiCharts({');
    expect(page).toContain('newLeads: summary.newLeads');
    expect(page).toContain('monthlyIncome: monthly.income');
    expect(page).toContain('previousIncome: monthly.previousIncome');
    expect(page).toContain('<KpiMiniChart model={kpi.chart} />');
    expect(page).not.toContain('dummy');
  });
});
