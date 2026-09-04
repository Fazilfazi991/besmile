import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8').toLowerCase();
const migrations = {
  chat: read('20260904103522_restore_chat_mentions_contract.sql'),
  statements: read('20260904103528_restore_psychologist_payment_statements.sql'),
  payroll: read('20260904103534_restore_payroll_adjustments.sql'),
  onboarding: read('20260904103540_restore_employee_onboarding.sql'),
  meetings: read('20260904103546_restore_meetings_minutes.sql'),
  policies: read('20260904103552_restore_policy_documents.sql'),
};

describe('Phase 8E canonical database recovery', () => {
  it('restores all 17 active Production-only tables', () => {
    const sql = Object.values(migrations).join('\n');
    for (const table of [
      'chat_message_mentions',
      'employee_onboardings', 'onboarding_documents', 'onboarding_events', 'onboarding_tasks',
      'meeting_action_items', 'meeting_decisions', 'meeting_events', 'meeting_mom_versions', 'meeting_notes',
      'payroll_adjustments',
      'policy_assistant_rate_limits', 'policy_document_audiences', 'policy_documents', 'policy_sections',
      'psychologist_payment_statement_items', 'psychologist_payment_statements',
    ]) expect(sql).toContain(`public.${table}`);
  });

  it('enables RLS on every restored exposed table', () => {
    const sql = Object.values(migrations).join('\n');
    for (const table of [
      'chat_message_mentions',
      'employee_onboardings', 'onboarding_documents', 'onboarding_events', 'onboarding_tasks',
      'meeting_action_items', 'meeting_decisions', 'meeting_events', 'meeting_mom_versions', 'meeting_notes',
      'payroll_adjustments',
      'policy_assistant_rate_limits', 'policy_document_audiences', 'policy_documents', 'policy_sections',
      'psychologist_payment_statement_items', 'psychologist_payment_statements',
    ]) expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it('restores the complete private policy-document storage contract', () => {
    expect(migrations.policies).toContain("values('policy-documents','policy-documents',false");
    expect(migrations.policies).toContain('policy_document_visible');
    expect(migrations.policies).toContain('policy pdf manager upload');
    expect(migrations.policies).toContain('policy pdf scoped read');
    expect(migrations.policies).toContain('policy pdf manager cleanup');
  });

  it('keeps restored privileged functions unavailable to public and anon', () => {
    for (const sql of Object.values(migrations)) {
      if (sql.includes('security definer')) expect(sql).toMatch(/revoke (?:all|execute) on function[\s\S]*from public\s*,?\s*anon/);
    }
    expect(migrations.payroll).toContain('payroll_entry_calculate(),public.payroll_entry_guard(),public.payroll_run_guard() from public,anon,authenticated');
    expect(migrations.onboarding).toContain('notify_onboarding_owner() from public,anon,authenticated');
    expect(migrations.meetings).toContain('meeting_host_allowed(uuid) from public,anon,authenticated');
  });

  it('does not restore obsolete chat_channels compatibility drift', () => {
    expect(migrations.chat).not.toContain('create table if not exists public.chat_channels');
  });
});
