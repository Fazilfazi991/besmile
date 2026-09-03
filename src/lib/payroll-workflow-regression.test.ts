import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const payrollPage = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/payroll/page.tsx'), 'utf8');
const adminRepository = readFileSync(resolve(process.cwd(), 'src/lib/admin-repository.ts'), 'utf8');
const payrollLifecycle = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808180000_payroll_atomic_lifecycle.sql'), 'utf8');

describe('payroll workflow regressions', () => {
  it('calculates payroll period end in UTC to avoid timezone drift', () => {
    expect(payrollPage).toContain('new Date(Date.UTC(year, nextMonth, 0))');
    expect(payrollPage).toContain('period_end: periodEnd');
  });

  it('marks the payroll run paid when the last entry is paid', () => {
    expect(adminRepository).toMatch(/rpc\(["']pay_payroll_entry_atomic["']/);
    expect(payrollLifecycle).toContain('select * into entry from public.payroll_entries where id=target_entry for update');
    expect(payrollLifecycle).toContain('select * into run from public.payroll_runs where id=entry.payroll_run_id for update');
    expect(payrollLifecycle).toContain("payment_status='paid'");
    expect(payrollLifecycle).toContain("payment_status <> 'paid'");
    expect(payrollLifecycle).toContain("update public.payroll_runs set status='paid'");
  });
});
