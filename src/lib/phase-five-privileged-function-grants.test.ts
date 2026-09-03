import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260903192350_restrict_broad_privileged_function_execution.sql',
  'utf8',
).toLowerCase();

const authenticatedRpcs = [
  'appointment_has_permission(text)',
  'create_doctor_appointment(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text)',
  'update_doctor_appointment(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text)',
  'update_doctor_appointment_status(uuid,text,text)',
  'reschedule_doctor_appointment(uuid,timestamp with time zone,timestamp with time zone,text)',
  'delete_doctor_appointment(uuid,text)',
  'create_or_get_direct_chat(uuid)',
  'create_group_chat(text,text,text,uuid[])',
  'manage_group_chat_member(uuid,uuid,text)',
  'record_expired_task_permissions()',
];

const triggerFunctions = [
  'audit_permission_grant_event()',
  'audit_row()',
  'audit_task_assignment_event()',
  'enforce_leave_request_lifecycle()',
  'finance_audit_event()',
  'finance_invoice_payment_ledger()',
  'finance_refresh_invoice_status()',
  'log_idea_support()',
  'notify_announcement_publish()',
  'notify_crm_lead_assignment()',
  'notify_document_event()',
  'notify_idea_comment()',
  'notify_onboarding_owner()',
  'patient_action_activity_event()',
  'patient_activity_event()',
  'profile_operational_activity_event()',
  'record_employee_status_change()',
];

describe('phase five privileged function grant hardening', () => {
  it('removes public and anonymous execution while retaining authenticated business RPCs', () => {
    for (const signature of authenticatedRpcs) {
      expect(migration).toContain(`'public.${signature}'`);
    }
    expect(migration).toContain("from public, anon'");
    expect(migration).toContain("to authenticated'");
  });

  it('removes direct execution of trigger-only functions from API roles', () => {
    for (const signature of triggerFunctions) {
      expect(migration).toContain(`'public.${signature}'`);
    }
    expect(migration).toContain("from public, anon, authenticated'");
  });

  it('remains additive and schema-variant tolerant', () => {
    expect(migration).toContain('to_regprocedure(function_signature) is not null');
    expect(migration).not.toMatch(/\b(drop|alter)\s+function\b/);
  });
});
