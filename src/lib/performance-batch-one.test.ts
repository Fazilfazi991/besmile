import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260813094151_performance_batch_one.sql',
  'utf8',
).toLowerCase();
const employeeRepository = readFileSync('src/lib/employee-repository.ts', 'utf8');

describe('performance batch one', () => {
  it('batches permission checks without replacing the hardened permission decision', () => {
    expect(migration).toContain('function public.granted_permissions(permission_codes text[])');
    expect(migration).toContain('where public.has_permission(requested_code)');
    expect(migration).toContain('security invoker');
    expect(employeeRepository).toContain('.rpc("granted_permissions"');
  });

  it('keeps chat and CRM summaries inside the caller RLS context', () => {
    expect(migration).toContain('function public.chat_conversation_summaries()');
    expect(migration).toContain('function public.crm_dashboard_summary(period_start date, period_end date)');
    expect(migration.match(/security invoker/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).not.toContain('function public.chat_conversation_summaries()\nreturns table(\n  conversation_id uuid,\n  last_read_at timestamptz,\n  chat_conversations jsonb,\n  latest_message jsonb,\n  unread_count bigint\n)\nlanguage sql\nstable\nsecurity definer');
  });

  it('bounds active conversation history', () => {
    expect(employeeRepository).toContain('async chatMessagePage(');
    expect(employeeRepository).toContain('.limit(size)');
    expect(employeeRepository).toContain('request.lt("created_at", before)');
  });
});
