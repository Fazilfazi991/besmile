import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compactInr } from './finance-format';
import { executiveFirstName } from './executive-dashboard';

const dashboardSource = readFileSync(resolve(process.cwd(), 'src/components/director-executive-dashboard.tsx'), 'utf8');

describe('director executive dashboard visual contracts', () => {
  it('uses a safe first-name greeting without incomplete honorifics', () => {
    expect(executiveFirstName('Mr. Yousaf Abdulla')).toBe('Yousaf');
    expect(executiveFirstName('  Dr Yousaf ')).toBe('Yousaf');
    expect(executiveFirstName(null)).toBe('');
  });

  it('uses the canonical INR code with compact, unclipped values', () => {
    expect(compactInr(15_745)).toBe('INR 15.7K');
    expect(compactInr(1_240_000)).toBe('INR 12.4L');
  });

  it('uses Recharts for primary analytics and compact empty states', () => {
    expect(dashboardSource).toContain("from 'recharts'");
    expect(dashboardSource).toContain('<ComposedChart');
    expect(dashboardSource).toContain('<ResponsiveContainer');
    expect(dashboardSource).toContain('No finance activity in this period');
    expect(dashboardSource).toContain('No leads entered this period');
    expect(dashboardSource).not.toContain('<svg');
    expect(dashboardSource).not.toContain('<polyline');
  });
});
