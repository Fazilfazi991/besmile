import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20260929110000_release_2_workflows_and_client_sessions.sql', import.meta.url), 'utf8');
const scheduling = readFileSync(new URL('./doctor-scheduling-repository.ts', import.meta.url), 'utf8');
const schedulingUi = readFileSync(new URL('../components/doctor-scheduling.tsx', import.meta.url), 'utf8');
const genieRoute = readFileSync(new URL('../app/api/genie/route.ts', import.meta.url), 'utf8');
const patientWorkspace = readFileSync(new URL('../components/patient-workspace.tsx', import.meta.url), 'utf8');

describe('BSMILE combined lifecycle migration', () => {
  it('binds Genie confirmation to actor, draft version, token, and a durable idempotency key', () => {
    expect(migration).toContain('unique(actor_id, action_type, idempotency_key)');
    expect(migration).toContain('workflow.version <> expected_version');
    expect(migration).toContain('workflow.confirmation_token is distinct from expected_confirmation_token');
    expect(migration).toContain("(workflow.identity_snapshot->>'actor_id')::uuid is distinct from auth.uid()");
    expect(migration).toContain("pg_advisory_xact_lock(pg_catalog.hashtextextended('genie-lead-phone:'||normalized_phone,0))");
    expect(genieRoute).toContain("'23505': { status: 409, message: 'A conflicting record already exists.' }");
    expect(genieRoute).not.toContain("known && detail ? detail");
  });

  it('replays a completed browser confirmation after the one-time token is cleared', () => {
    expect(migration).toContain("workflow.status = 'completed' and expected_confirmation_token is null");
    expect(migration).toContain("prior.request_payload->'draft' is distinct from workflow.draft");
    expect(genieRoute).toContain('expected_confirmation_token: null');
  });

  it('keeps repeat-session receipts canonical and idempotent', () => {
    expect(migration).toContain('create_patient_session_with_payment');
    expect(migration).toContain('finance_invoice_payments');
    expect(migration).toContain('patient_sessions_creator_request_unique');
    expect(migration).toContain('finance_invoice_payment_request_unique');
    expect(patientWorkspace).toContain('Record payment now');
    expect(patientWorkspace).toContain('Add Payment');
    expect(patientWorkspace).toContain('Record Payment');
    expect(patientWorkspace).toContain('Outstanding: INR');
  });

  it('separates the client session fee from the practitioner payout snapshot', () => {
    expect(migration).toContain('session_fee numeric(14,2)');
    expect(migration).toContain('client_session_fee');
    expect(migration).toContain('default_session_payout into payout');
    expect(scheduling).toContain("rpc('create_doctor_appointment_v2'");
    expect(scheduling).toContain('client_session_fee: payload.appointmentFee');
    expect(migration).toContain('null,appointment_fee,auth.uid(),auth.uid()');
    expect(migration).not.toContain('appointment_consultation_type,appointment_fee,appointment_remarks,gen_random_uuid()');
    expect(schedulingUi).toContain('Legacy psychologist payout:');
    expect(schedulingUi).toContain('Client fee not recorded');
  });

  it('preserves conversion dates and repairs invoices only through stable foreign keys', () => {
    expect(migration).toContain('new.converted_at:=old.converted_at');
    expect(migration).toContain('invoice.sale_id=sale.id');
    expect(migration).not.toMatch(/invoice\.(?:customer_name|customer_phone|customer_email)\s*=/);
  });

  it('implements reversible audited archival without deleting financial history', () => {
    expect(migration).toContain('patient_archive_events');
    expect(migration).toContain('Cancel or reschedule future appointments before archiving.');
    expect(migration).toContain('Outstanding payments must be acknowledged before archiving.');
    expect(migration).toContain('create or replace function public.restore_patient');
    expect(migration).not.toMatch(/delete\s+from\s+public\.(?:finance_|patients)/i);
    expect(migration).toContain("action='view'");
    expect(migration).toContain('p.archived_at is null');
  });

  it('rechecks current authorization before replaying committed operations', () => {
    expect(migration.indexOf("if not public.has_permission('patient_sessions.create')")).toBeLessThan(migration.indexOf('select * into session_row from public.patient_sessions'));
    expect(migration.indexOf("if not (public.has_permission('invoices.manage')")).toBeLessThan(migration.indexOf('select * into payment from public.finance_invoice_payments'));
    expect(migration.indexOf("if not public.appointment_patient_access('create',target_patient)")).toBeLessThan(migration.indexOf('select id,creation_request_payload into new_id,prior_payload'));
    expect(migration).toContain('payment.idempotency_payload is distinct from request_payload');
    expect(migration).toContain('prior_payload is distinct from request_payload');
  });

  it('replaces the fixed 40-row picker with bounded authorized remote lookup', () => {
    expect(scheduling).toContain("rpc('appointment_patient_options'");
    expect(scheduling).not.toContain(".limit(40)");
    expect(scheduling).toContain('page_offset: offset');
    expect(scheduling).toContain('page_size: Math.min(100, pageSize + 1)');
    expect(migration).toContain('public.patient_care_access(p.id)');
    expect(migration).toContain('p.archived_at is null');
  });
});
