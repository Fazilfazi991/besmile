import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260821150000_chat_disappearing_messages.sql'), 'utf8');
const worker = readFileSync(resolve(process.cwd(), 'src/app/api/internal/chat-expiry/route.ts'), 'utf8');

describe('disappearing message lifecycle', () => {
  it('uses approved retention values and leaves history non-expiring', () => {
    expect(migration).toContain('in (0, 86400, 604800, 2592000)');
    expect(migration).toContain('before insert on public.chat_messages');
  });
  it('keeps expiration distinct from manual deletion and is idempotent', () => {
    expect(migration).toContain("expired_at is null");
    expect(migration).toContain("attachment_cleanup_state=case when attachment_path is null then 'not_required' else 'pending' end");
  });
  it('uses the project cron convention and a machine-only storage worker', () => {
    expect(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')).toContain('"0 * * * *"');
    expect(worker).toContain('x-chat-expiry-worker-secret');
    expect(worker).toContain('CRON_SECRET');
    expect(worker).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(worker).toContain('.remove([attachment.attachment_path])');
  });
  it('records lifecycle events and makes cleanup failures retryable', () => {
    expect(migration).toContain("'system'");
    expect(migration).toContain('attachment_cleanup_attempts');
    expect(worker).toContain('["pending", "failed"]');
    expect(worker).toContain('"processing"');
  });
});
