import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executiveInr } from './finance-format';
import { executiveFirstName } from './executive-dashboard';

const dashboardSource = readFileSync(resolve(process.cwd(), 'src/components/director-executive-dashboard.tsx'), 'utf8');
const financeSource = readFileSync(resolve(process.cwd(), 'src/components/executive-finance-overview.tsx'), 'utf8');

describe('director executive dashboard visual contracts', () => {
  it('uses a safe first-name greeting without incomplete honorifics', () => {
    expect(executiveFirstName('Mr. Yousaf Abdulla')).toBe('Yousaf');
    expect(executiveFirstName('  Dr Yousaf ')).toBe('Yousaf');
    expect(executiveFirstName(null)).toBe('');
  });

  it('shows exact INR amounts with Indian grouping on executive cards', () => {
    expect(executiveInr(1_000)).toBe('INR 1,000');
    expect(executiveInr(11_300)).toBe('INR 11,300');
    expect(executiveInr(125_000)).toBe('INR 1,25,000');
    expect(executiveInr(493_276)).toBe('INR 4,93,276');
    expect(executiveInr(-493_276.25)).toBe('INR -4,93,276.25');
    expect(dashboardSource).not.toContain('compactInr');
    expect(financeSource).not.toContain('compactInr');
  });

  it('uses Recharts for primary analytics and compact empty states', () => {
    expect(dashboardSource).toContain("from 'recharts'");
    expect(dashboardSource).toContain('<ComposedChart');
    expect(dashboardSource).toContain('<ResponsiveContainer');
    expect(financeSource).toContain('No finance activity in this period');
    expect(dashboardSource).toContain('No leads entered this period');
    expect(dashboardSource).not.toContain('<svg');
    expect(dashboardSource).not.toContain('<polyline');
  });
});
