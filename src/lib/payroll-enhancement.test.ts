import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260814061003_batch_4_payroll_enhancement.sql'), 'utf8');
const followup = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260814071500_batch_4_payroll_audit_followup.sql'), 'utf8');
const employeePage = readFileSync(resolve(process.cwd(), 'src/app/employee/payroll/page.tsx'), 'utf8');
const employeeRepository = readFileSync(resolve(process.cwd(), 'src/lib/employee-repository.ts'), 'utf8');
const payslipRoute = readFileSync(resolve(process.cwd(), 'src/app/api/payroll/entries/[id]/payslip/route.ts'), 'utf8');
const reportRoute = readFileSync(resolve(process.cwd(), 'src/app/api/payroll/runs/[id]/report/route.ts'), 'utf8');
const payrollDetail = readFileSync(resolve(process.cwd(), 'src/app/admin/finance/payroll/[id]/page.tsx'), 'utf8');
const diyaBoundary = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260813130000_production_user_cleanup.sql'), 'utf8');
const psychologistPayables = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260813213043_psychologist_session_payables.sql'), 'utf8');

describe('Batch 4 employee payroll integrity', () => {
  it('creates only active employee snapshots from effective salary settings', () => {
    expect(followup).toContain("profile.status='active'");
    expect(followup).toContain('settings.effective_date<=target_period_end');
    expect(followup).toContain('profile.workforce_visible');
    expect(followup).toContain('profile.joining_date<=target_period_end');
    expect(migration).toContain('settings.basic_salary,settings.default_allowances,settings.default_deductions');
  });

  it('leaves intern and probation eligibility unassumed while excluding former employees', () => {
    expect(followup).toContain("profile.status='active'");
    expect(followup).not.toContain("profile.status in ('active','intern','probation')");
    for (const status of ['resigned', 'inactive', 'terminated']) expect(followup).not.toContain(`profile.status='${status}'`);
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
    expect(followup).toContain('where id=target_entry for update');
    expect(followup).toContain("entry.finance_transaction_id is not null");
    expect(followup).toContain("values('payroll_payment'");
    expect(followup).toContain('finance_transaction_id=ledger_id');
    expect(followup).toContain("not exists(select 1 from public.finance_accounts where id=target_account and is_active)");
  });

  it('requires explicit Finance account selection and never defaults to the first account', () => {
    expect(payrollDetail).toContain("account_id: ''");
    expect(payrollDetail).not.toContain("account_id: accounts[0]");
    expect(payrollDetail).toContain('<option value="">Select account</option>');
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
    expect(employeeRepository).toContain('async myPayroll(profileId: string)');
    expect(employeeRepository).toContain('.eq("profile_id", profileId)');
    expect(employeeRepository).toContain('.in("payment_status", ["approved", "paid"])');
  });

  it('builds payslips from the stored finalized snapshot on the server', () => {
    expect(payslipRoute).toContain("from('payroll_entries')");
    expect(payslipRoute).toContain('entry.gross_earnings');
    expect(payslipRoute).toContain('entry.net_payable');
    expect(payslipRoute).toContain("record_payroll_payslip_access");
    expect(payslipRoute).toContain("Payment date: ${entry.payment_date || 'Pending'}");
    expect(payslipRoute).toContain('generateOfficialReport');
    expect(reportRoute).toContain('generateOfficialReport');
    expect(reportRoute).toContain("run.status === 'draft'");
  });

  it('preserves the Diya Finance boundary and outsourced psychologist separation', () => {
    expect(diyaBoundary).toContain("permission.code like 'finance.%'");
    expect(diyaBoundary).toContain("permission.code like 'payroll.%'");
    expect(diyaBoundary).toContain("permission.code like 'invoices.%'");
    expect(psychologistPayables).toContain("'psychologist_payment'");
    expect(psychologistPayables).toContain('psychologist_session_payables');
    expect(followup).not.toContain('psychologist_session_payables');
    expect(followup).not.toContain("values('psychologist_payment'");
  });
});
