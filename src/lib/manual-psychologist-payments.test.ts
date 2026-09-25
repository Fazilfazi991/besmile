import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260924174142_manual_psychologist_payments.sql'), 'utf8');
const sourceInvariant = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260924180405_psychologist_payable_source_invariants.sql'), 'utf8');
const automaticGeneration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260909194641_appointment_hourly_cadence_and_variable_fee.sql'), 'utf8');
const automaticSettlement = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260916073033_assistant_manager_psychologist_payment_settlement.sql'), 'utf8');
const component = readFileSync(resolve(process.cwd(), 'src/components/psychologist-session-payables.tsx'), 'utf8');

describe('manual psychologist payment workflow', () => {
  it('reuses the payable table and identifies legacy/generated rows as automatic', () => {
    expect(migration).toContain("add column if not exists source text not null default 'automatic'");
    expect(migration).toContain("check (source in ('automatic', 'manual'))");
    expect(migration).toContain('alter column appointment_id drop not null');
    expect(migration).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(?:manual_)?psychologist_payments/i);
    expect(migration).not.toContain('create or replace function public.create_psychologist_session_payable');
  });

  it('authorizes manual creation and editing in database functions', () => {
    expect(migration).toContain("not public.has_permission('psychologist_payments.manage')");
    expect(migration).toContain("target_status = 'paid' and not public.has_permission('psychologist_payments.settle')");
    expect(migration).toContain("payable.source <> 'manual'");
    expect(migration).toContain("payable.status not in ('payment_due', 'scheduled')");
    expect(migration).toContain('Only unpaid manual payments can be edited.');
    expect(migration).toContain('created_by');
  });

  it('grants manual entry only to Diya rather than every Assistant Manager', () => {
    expect(migration).toContain("permission.code = 'psychologist_payments.manage'");
    expect(migration).toContain("profile.employee_code = 'A002'");
    expect(migration).toContain("lower(profile.email) = 'diyaadminbsmile@gmail.com'");
    expect(migration).toContain('not exists (');
    expect(migration).not.toContain("designation = 'Assistant Manager'");
  });

  it('restores historical automatic-row requirements while allowing session-free manual rows', () => {
    for (const column of ['appointment_id', 'session_date', 'session_completed_at', 'session_record_submitted_at', 'psychologist_rate', 'payment_cycle_type']) {
      expect(migration).toContain(`alter column ${column} drop not null`);
      expect(sourceInvariant).toContain(`${column} is not null`);
    }
    expect(sourceInvariant).toContain("source = 'automatic'");
    expect(sourceInvariant).toContain("source = 'manual'");
    expect(sourceInvariant).toContain('payment_cycle_type is not null');
    expect(sourceInvariant).toContain("payment_cycle_type = 'manual'");
    expect(sourceInvariant).toContain('due_date is not null');
    expect(sourceInvariant).toContain('created_by is not null');
    expect(migration).toContain("add column if not exists source text not null default 'automatic'");
    expect(migration).not.toMatch(/update\s+public\.psychologist_session_payables\s+set\s+source/i);
  });

  it('keeps appointment identity as the automatic generation and duplicate key', () => {
    expect(automaticGeneration).toContain('insert into public.psychologist_session_payables(appointment_id,psychologist_id');
    expect(automaticGeneration).toContain('on conflict(appointment_id) do nothing');
    expect(automaticGeneration).toContain('appointment.psychologist_fee_snapshot,appointment.psychologist_fee_snapshot');
    expect(automaticGeneration).toContain('payment_cycle_type,payment_term_days');
    expect(migration).toContain('appointment_id, psychologist_id, psychologist_profile_id');
    expect(migration).toContain("null, clinician.id, clinician.profile_id");
  });

  it('does not replace automatic settlement or expose automatic rows to manual editing', () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function\s+public\.settle_psychologist_session_payable/i);
    expect(automaticSettlement).toContain("not public.has_permission('psychologist_payments.settle')");
    expect(automaticSettlement).toContain('where id = payable.id');
    expect(component).toContain("canManage && isManual && x.status !== 'paid'");
    expect(component).toContain("canSettlePermission && (x.status === 'payment_due' || x.status === 'scheduled')");
    expect(component).toContain("const due = rows.filter(x => x.status === 'payment_due')");
    expect(component).toContain("const scheduled = rows.filter(x => x.status === 'scheduled')");
    expect(component).toContain('[...scheduled, ...due].reduce');
    expect(component).toContain('label="Scheduled"');
    expect(component).toContain('paid_by_profile?.full_name || x.paid_by');
  });

  it('records paid entries in the existing Finance ledger and audits mutations', () => {
    expect(migration).toContain("'psychologist_payment', target_account, category_id");
    expect(migration).toContain("'Psychologist session payout'");
    expect(migration).toContain('finance_transaction_id = ledger_id');
    expect(migration).toContain('manual_psychologist_payment_created');
    expect(migration).toContain('manual_psychologist_payment_updated');
  });

  it('exposes the manual flow, canonical status, filters, and Finance totals', () => {
    expect(component).toContain('+ Add Psychologist Payment');
    expect(component).toContain("db.rpc('create_manual_psychologist_payment'");
    expect(component).toContain("db.rpc('update_manual_psychologist_payment'");
    expect(component).toContain("db.rpc('settle_psychologist_session_payable'");
    expect(component).toContain('label="Pending"');
    expect(component).toContain('label="Total paid"');
    expect(component).toContain('Due date from');
    expect(component).toContain('Due date to');
    expect(component).toContain("x.source === 'manual'");
    expect(component).toContain("'payment_due'");
  });
});
