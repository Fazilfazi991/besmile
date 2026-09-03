import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20260903211500_restrict_remaining_security_definer_execution.sql', 'utf8').toLowerCase();

describe('phase seven SECURITY DEFINER grant hardening', () => {
  it('narrows all 31 reviewed policy/read helpers to authenticated', () => {
    expect(migration.match(/'public\.[^']+'/g)).toHaveLength(41);
    expect(migration).toContain("from public, anon'");
    expect(migration).toContain("to authenticated'");
  });
  it('removes all API-role execution from ten remaining trigger functions', () => {
    for (const name of ['assign_chat_message_expiry()', 'enforce_attendance_workday()', 'enforce_employee_status_change()', 'enforce_profile_self_update()', 'enforce_task_assignment_update()', 'finance_prevent_overpayment()', 'notify_selected_announcement_recipient()', 'notify_task_assignment()', 'notify_task_update()', 'prepare_chat_message_channel()']) expect(migration).toContain(`'public.${name}'`);
    expect(migration).toContain("from public, anon, authenticated'");
  });
  it('is additive and safe across schema variants', () => {
    expect(migration).toContain('to_regprocedure(function_signature) is not null');
    expect(migration).not.toMatch(/\b(drop|alter)\s+function\b/);
  });
});
