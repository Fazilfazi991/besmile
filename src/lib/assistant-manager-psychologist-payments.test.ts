import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916073033_assistant_manager_psychologist_payment_settlement.sql'),
  'utf8',
);
const component = readFileSync(
  resolve(process.cwd(), 'src/components/psychologist-session-payables.tsx'),
  'utf8',
);
const e5Crm = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915030947_permissions_client_workspace_e5.sql'),
  'utf8',
);
const e5Documents = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915144157_e5_official_document_creation.sql'),
  'utf8',
);

describe('Assistant Manager psychologist payment settlement access', () => {
  it('extends the canonical designation bundle additively', () => {
    expect(migration).toContain("designation = 'Assistant Manager'");
    expect(migration).toContain("'psychologist_payments.view', 'psychologist_payments.settle'");
    expect(migration).toContain('on conflict do nothing');
    expect(migration).not.toMatch(/delete\s+from\s+public\.designation_permission_bundle_permissions/i);
    expect(migration).not.toMatch(/update\s+public\.designation_permission_bundle_permissions/i);
    expect(migration).not.toContain("'psychologist_payments.manage'");
    expect(migration).not.toContain("public.has_permission('finance.manage')");
  });

  it('preserves the previously approved CRM, sales, and official-document grants', () => {
    for (const code of ['crm.manage_all', 'leads.create', 'leads.edit', 'sales.view', 'sales.edit']) {
      expect(e5Crm).toContain(`'${code}'`);
    }
    expect(e5Crm).toContain("'documents.employee.view'");
    expect(e5Documents).toContain("'documents.official.generate'");
    for (const type of [
      'offer_letter', 'appointment_letter', 'experience_letter',
      'general_report', 'sales_report', 'custom_official_document',
    ]) {
      expect(e5Documents).toContain(`'${type}'`);
    }
  });

  it('uses a bounded account lookup rather than exposing Finance administration', () => {
    expect(migration).toContain('function public.psychologist_payment_accounts()');
    expect(migration).toContain("public.has_permission('psychologist_payments.settle')");
    expect(migration).toContain('where account.is_active');
    expect(component).toContain("db.rpc('psychologist_payment_accounts')");
    expect(component).not.toContain("db.from('finance_accounts')");
  });

  it('keeps the dedicated payout category compatible with Finance validation', () => {
    expect(migration).toContain("new.transaction_type = 'psychologist_payment'");
    expect(migration).toContain("name = 'Psychologist session payout'");
    expect(migration).toContain("new.transaction_type in ('expense', 'payroll_payment')");
  });

  it('keeps settlement atomic, auditable, and unavailable for arbitrary direct updates', () => {
    expect(migration).toContain("payable.status not in ('payment_due', 'scheduled')");
    expect(migration).toContain("transaction_type, account_id, expense_category_id, amount");
    expect(migration).toContain("'psychologist_session_payable_paid'");
    expect(migration).toContain('finance_transaction_id = ledger_id');
    expect(migration).not.toMatch(/grant\s+update\s+on\s+(?:table\s+)?public\.psychologist_session_payables/i);
    expect(migration).not.toMatch(/grant\s+(?:insert|update|delete).*public\.finance_transactions/i);
  });
});
