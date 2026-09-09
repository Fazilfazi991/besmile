import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const operational = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const director = readFileSync(new URL('../components/director-executive-dashboard.tsx', import.meta.url), 'utf8');
const repository = readFileSync(new URL('./admin-repository.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('dashboard KPI visual contract', () => {
  it('renders a chart inside every operational and Director KPI mapping', () => {
    expect(operational).toContain('<KpiMiniChart model={kpi.chart} />');
    expect(operational.match(/chart: charts\./g)).toHaveLength(8);
    expect(director.match(/chart={charts\./g)).toHaveLength(5);
    expect(director).toContain('<KpiMiniChart model={chart} />');
  });

  it('preserves all KPI navigation destinations', () => {
    for (const href of ['/admin/employees', '/admin/attendance', '/admin/crm', '/admin/finance', '/admin/leaves', '/admin/tasks', '/admin/finance/invoices', '/admin/finance/payroll']) expect(operational).toContain(`href: '${href}'`);
    for (const href of ['/admin/finance', '/admin/finance/income', '/admin/crm/leads', '/admin/crm', '/admin/finance/invoices']) expect(director).toContain(`href="${href}"`);
  });

  it('reuses existing scoped queries and adds no chart-only database request', () => {
    expect(repository).toContain(".eq('workforce_visible',true)");
    expect(repository).toContain(".is('archived_at',null)");
    expect(repository).toContain('timezone:settings.timezone');
    expect(operational).not.toContain('dashboardChart');
  });

  it('keeps charts non-intercepting, responsive, and readable on colorful surfaces', () => {
    expect(styles).toContain('.kpi-chart{min-width:0');
    expect(styles).toContain('pointer-events:none');
    expect(styles).toContain('html[data-theme="colorful"] .kpi-chart-donut>span i');
    expect(styles).toContain('@media(max-width:700px)');
  });
});
