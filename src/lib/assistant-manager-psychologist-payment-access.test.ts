import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminRouteRequirement, employeeNavigation, filterNavigation, permissionAllows } from './permission-access';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260821100000_assistant_manager_psychologist_payment_view.sql'),
  'utf8',
);
const paymentMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260813213043_psychologist_session_payables.sql'),
  'utf8',
);
const component = readFileSync(resolve(process.cwd(), 'src/components/psychologist-session-payables.tsx'), 'utf8');

describe('Assistant Manager psychologist payment access', () => {
  it('grants only the dedicated view and settlement permissions to the Assistant Manager designation', () => {
    expect(migration).toContain("permission.code in ('psychologist_payments.view', 'psychologist_payments.settle')");
    expect(migration).toContain("assistant.role::text = 'staff'");
    expect(migration).toContain("assistant.designation = 'Assistant Manager'");
    expect(migration).not.toContain("'psychologist_payments.manage'");
    expect(migration).not.toMatch(/permission\.code.*(?:finance\.|payroll)/i);
    expect(migration).not.toMatch(/Diya/i);
  });

  it('shows the menu and permits the direct payment URL only with the dedicated view permission', () => {
    const assistantPermissions = new Set(['admin.shell', 'psychologist_payments.view', 'psychologist_payments.settle']);
    const unauthorizedPermissions = new Set(['admin.shell']);
    const menu = filterNavigation(employeeNavigation, assistantPermissions);

    expect(menu.flatMap((group) => group.links).some((link) => link.href === '/admin/finance/psychologist-payments')).toBe(true);
    expect(permissionAllows(assistantPermissions, adminRouteRequirement('/admin/finance/psychologist-payments'))).toBe(true);
    expect(permissionAllows(unauthorizedPermissions, adminRouteRequirement('/admin/finance/psychologist-payments'))).toBe(false);
  });

  it('keeps direct database access RLS-protected and uses payment-specific settlement authority', () => {
    expect(paymentMigration).toContain("using(public.has_permission('psychologist_payments.view'))");
    expect(migration).toContain("not public.has_permission('psychologist_payments.settle')");
    expect(migration).not.toContain("not public.has_permission('psychologist_payments.settle') or not public.has_permission('finance.manage')");
    expect(migration).toContain('eligible_psychologist_payment_accounts');
    expect(component).toContain("setCanSettlePayments(permissions.has('psychologist_payments.settle'))");
    expect(component).toContain("canSettlePayments && x.status === 'payment_due'");
  });

  it('settles exactly one eligible payable with the canonical finance transaction and audit history', () => {
    expect(migration).toContain("payable.status not in ('payment_due','scheduled') or payable.finance_transaction_id is not null");
    expect(migration).toContain("transaction_type,account_id,expense_category_id,amount");
    expect(migration).toContain("'psychologist_payment'");
    expect(migration).toContain("status='paid'");
    expect(migration).toContain("'psychologist_session_payable_paid'");
    expect(migration).toContain("paid_by=(select auth.uid())");
  });

  it('does not permit cancelled, incomplete, paid, staff, intern, or clinician settlement without the settle permission', () => {
    expect(migration).toContain("payable.status not in ('payment_due','scheduled')");
    expect(migration).toContain("not public.has_permission('psychologist_payments.settle')");
    expect(migration).toContain("assistant.role::text = 'staff'");
    expect(migration).toContain("assistant.designation = 'Assistant Manager'");
    expect(paymentMigration).toContain("appointment.status <> 'completed'");
    expect(paymentMigration).toContain("appointment.consultation_type <> 'online'");
    expect(paymentMigration).toContain("clinician.clinician_type <> 'outsourced'");
  });

  it('preserves the existing higher-management role permissions', () => {
    expect(paymentMigration).toContain("('Chairman'), ('Director'), ('General Manager')");
    expect(paymentMigration).toContain("'psychologist_payments.view','psychologist_payments.manage','psychologist_payments.settle'");
  });
});
