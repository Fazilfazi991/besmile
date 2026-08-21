import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260821130000_chat_message_lifecycle.sql'),
  'utf8',
);

describe('chat message lifecycle migration', () => {
  it('adds nullable, forward-only reply and audit state', () => {
    expect(migration).toContain('reply_to_message_id uuid references public.chat_messages(id) on delete set null');
    expect(migration).toContain('edited_at timestamptz');
    expect(migration).toContain('deleted_at timestamptz');
    expect(migration).toContain('deleted_by uuid references public.profiles(id) on delete set null');
  });

  it('rejects cross-conversation reply targets in the insert policy', () => {
    expect(migration).toContain('m.conversation_id = target_conversation');
    expect(migration).toContain('public.chat_reply_target_is_valid(reply_to_message_id, conversation_id)');
  });

  it('restricts edit and soft delete to the current sender and member', () => {
    expect(migration).toContain('m.sender_id = auth.uid()');
    expect(migration).toContain("m.message_type = 'text'");
    expect(migration).toContain('m.deleted_at is null');
    expect(migration).toContain('public.is_chat_member(m.conversation_id)');
    expect(migration).toContain("set body = '', deleted_at = now(), deleted_by = auth.uid()");
  });
});
