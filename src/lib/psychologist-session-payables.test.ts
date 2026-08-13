import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260813213043_psychologist_session_payables.sql'),'utf8');
describe('psychologist session payables migration',()=>{
 it('enforces a single payable only after a submitted completed online outsourced session',()=>{expect(sql).toContain('appointment_id uuid not null unique');expect(sql).toContain("appointment.consultation_type <> 'online'");expect(sql).toContain("appointment.status <> 'completed'");expect(sql).toContain("clinician.clinician_type <> 'outsourced'");expect(sql).toContain('psychologist_session_records');});
 it('snapshots configured rates and due dates without zero-value fallback',()=>{expect(sql).toContain('psychologist_rate numeric(14,2) not null check(psychologist_rate > 0)');expect(sql).toContain('setting.default_session_payout');expect(sql).toContain("setting.payment_cycle_type='submission_plus_days'");expect(sql).toContain("'missing_rate'");});
 it('keeps financial history, audit, notification and finance-backed settlement secure',()=>{expect(sql).toContain("status='cancelled'");expect(sql).toContain('psychologist_session_payable_created');expect(sql).toContain('psychologist_payable_notify_management');expect(sql).toContain('psychologist_session_payable_paid');expect(sql).toContain("not public.has_permission('psychologist_payments.settle')");expect(sql).toContain('enable row level security');});
});
