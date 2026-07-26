import { describe, expect, it } from 'vitest';
import { mergeChatMessages, upsertChatMessage } from './chat-message-state';

describe('chat message reconciliation', () => {
  it('replaces an optimistic message with its persisted row using client_message_id', () => {
    const optimistic = { id: 'pending-1', client_message_id: 'client-1', created_at: '2026-07-26T10:00:00Z', body: 'DEMO-1', status: 'sending' };
    const saved = { id: 'db-1', client_message_id: 'client-1', created_at: '2026-07-26T10:00:01Z', body: 'DEMO-1' };
    expect(upsertChatMessage([optimistic], saved)).toEqual([{ ...saved, status: 'sent' }]);
  });

  it('keeps one row when the insert response and Realtime event have the same database id', () => {
    const saved = { id: 'db-1', client_message_id: 'client-1', created_at: '2026-07-26T10:00:01Z', body: 'DEMO-1' };
    expect(mergeChatMessages([], [saved, saved])).toHaveLength(1);
  });

  it('does not merge separate messages merely because their text is identical', () => {
    const first = { id: 'db-1', client_message_id: 'client-1', created_at: '2026-07-26T10:00:01Z', body: 'Same text' };
    const second = { id: 'db-2', client_message_id: 'client-2', created_at: '2026-07-26T10:00:02Z', body: 'Same text' };
    expect(mergeChatMessages([first], [second])).toHaveLength(2);
  });
});
