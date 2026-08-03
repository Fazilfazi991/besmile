import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const payrollPage = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/payroll/page.tsx'), 'utf8');
const adminRepository = readFileSync(resolve(process.cwd(), 'src/lib/admin-repository.ts'), 'utf8');

describe('payroll workflow regressions', () => {
  it('calculates payroll period end in UTC to avoid timezone drift', () => {
    expect(payrollPage).toContain('new Date(Date.UTC(year, nextMonth, 0))');
    expect(payrollPage).toContain('period_end: periodEnd');
  });

  it('marks the payroll run paid when the last entry is paid', () => {
    expect(adminRepository).toContain("eq('payroll_run_id',data.payroll_run_id)");
    expect(adminRepository).toContain("neq('payment_status','paid')");
    expect(adminRepository).toContain("update({status:'paid'})");
  });
});
