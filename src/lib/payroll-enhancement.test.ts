import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260814061003_batch_4_payroll_enhancement.sql'), 'utf8');
const employeePage = readFileSync(resolve(process.cwd(), 'src/app/employee/payroll/page.tsx'), 'utf8');
const payslipRoute = readFileSync(resolve(process.cwd(), 'src/app/api/payroll/entries/[id]/payslip/route.ts'), 'utf8');

describe('Batch 4 employee payroll integrity', () => {
  it('creates only active employee snapshots from effective salary settings', () => {
    expect(migration).toContain("profile.status='active'");
    expect(migration).toContain('settings.effective_date<=target_period_end');
    expect(migration).toContain('settings.basic_salary,settings.default_allowances,settings.default_deductions');
  });

  it('stores deterministic numeric gross and net snapshots', () => {
    expect(migration).toContain('gross_earnings numeric(14,2)');
    expect(migration).toContain('net_payable numeric(14,2)');
    expect(migration).toContain('new.net_payable:=new.gross_earnings-coalesce(new.deductions,0)-coalesce(new.other_deductions,0)');
  });

  it('prevents duplicate employee periods and invalid payroll values', () => {
    expect(migration).toContain("raise exception 'A payroll run already exists for this period.'");
    expect(migration).toContain('Payroll gross and net amounts cannot be negative.');
    expect(migration).toContain('target_period_start<>date_trunc');
  });

  it('finalizes snapshots atomically and prevents casual paid edits', () => {
    expect(migration).toContain("perform set_config('app.payroll_transition','approve',true)");
    expect(migration).toContain("raise exception 'Paid payroll is immutable.'");
    expect(migration).toContain("raise exception 'Paid payroll runs are immutable.'");
    expect(migration).toContain('finalized_at=now()');
  });

  it('settles once with a row lock and one linked Finance transaction', () => {
    expect(migration).toContain('where id=target_entry for update');
    expect(migration).toContain("entry.finance_transaction_id is not null");
    expect(migration).toContain("values('payroll_payment'");
    expect(migration).toContain('finance_transaction_id=ledger_id');
  });

  it('tracks every draft adjustment with reason, actor and timestamp', () => {
    expect(migration).toContain('create table if not exists public.payroll_adjustments');
    expect(migration).toContain('reason text not null');
    expect(migration).toContain('created_by uuid not null');
    expect(migration).toContain("'payroll_adjustment_added'");
  });

  it('allows finalized self-access while denying cross-employee and staff-wide access', () => {
    expect(migration).toContain('profile_id=(select auth.uid())');
    expect(migration).toContain("payment_status in ('approved','paid')");
    expect(migration).toContain("public.has_permission('payroll.view') or public.has_permission('payroll.manage')");
    expect(employeePage).toContain('employeeRepository.myPayroll(profile.id)');
  });

  it('builds payslips from the stored finalized snapshot on the server', () => {
    expect(payslipRoute).toContain("from('payroll_entries')");
    expect(payslipRoute).toContain('entry.gross_earnings');
    expect(payslipRoute).toContain('entry.net_payable');
    expect(payslipRoute).toContain("record_payroll_payslip_access");
  });
});
