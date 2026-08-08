import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260808150000_document_expiry_reminders.sql'), 'utf8');

describe('document expiry migration', () => {
  it('uses a business-timezone scheduler with idempotent per-window deliveries', () => {
    expect(migration).toContain("default 'Asia/Dubai'");
    expect(migration).toContain('unique(document_kind, document_id, recipient_id, expiry_date, reminder_days)');
    expect(migration).toContain("on conflict do nothing returning id into delivery_id");
    expect(migration).toContain("cron.schedule('bsmile-document-expiry-reminders', '5 * * * *'");
  });
  it('excludes inactive document records and protects internal runner access', () => {
    expect(migration).toContain('d.archived_at is null');
    expect(migration).toContain("d.status not in ('archived', 'replaced', 'rejected')");
    expect(migration).toContain('revoke execute on function public.run_document_expiry_reminders() from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.run_document_expiry_reminders() to service_role');
  });
});
