import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isChatMessageActive, isChatMessageLogicallyExpired } from './chat-message-state';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260822110000_chat_logical_expiry.sql'), 'utf8');
const repository = readFileSync(resolve(process.cwd(), 'src/lib/employee-repository.ts'), 'utf8');
const hub = readFileSync(resolve(process.cwd(), 'src/components/chat-hub.tsx'), 'utf8');
const cleanup = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260821150000_chat_disappearing_messages.sql'), 'utf8');

describe('chat logical expiry', () => {
  const now = Date.parse('2026-08-22T12:00:00.000Z');

  it('expires a message at expires_at before cleanup has set expired_at', () => {
    const waitingForCleanup = { expires_at: '2026-08-22T11:59:59.000Z', expired_at: null };
    expect(isChatMessageLogicallyExpired(waitingForCleanup, now)).toBe(true);
    expect(isChatMessageActive(waitingForCleanup, now)).toBe(false);
  });

  it('keeps future-expiring messages active and preserves cleanup as a later step', () => {
    expect(isChatMessageActive({ expires_at: '2026-08-22T12:00:01.000Z', expired_at: null }, now)).toBe(true);
    expect(cleanup).toContain('where expires_at<=now() and expired_at is null returning id');
  });

  it('uses logical expiry for rendering, replies, shared files, and the expiry clock', () => {
    expect(hub).toContain('const [logicalNow, setLogicalNow] = useState(() => Date.now());');
    expect(hub).toContain('window.setTimeout(() => setLogicalNow(Date.now())');
    expect(hub).toContain('const replyExpired = isChatMessageLogicallyExpired(message.reply_to || {}, now);');
    expect(hub).toContain('Original message expired');
    expect(hub).toContain('message.attachment_name && isChatMessageActive(message, logicalNow)');
  });

  it('blocks new attachment URLs and reactions before cleanup', () => {
    expect(repository).toContain('expires_at.is.null,expires_at.gt.${new Date().toISOString()}');
    expect(repository).toContain("This message is no longer available for reactions.");
    expect(migration).toContain('Supabase Storage evaluates this SELECT policy before issuing a signed URL.');
    expect(migration).toContain('chat reactions own insert');
    expect(migration).toContain('not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)');
  });

  it('excludes logically expired content from summaries, unread counts, and mentions', () => {
    expect(migration).toContain('create or replace function public.chat_conversation_summaries()');
    expect(migration).toContain('and not public.chat_message_is_logically_expired(message.expires_at,message.expired_at)');
    expect(migration).toContain('chat mentions visible to members');
    expect(repository).toContain('mention.message && isChatMessageActive(mention.message)');
  });
});
