import { describe, expect, it } from 'vitest';
import { chatActivitySummary, importantNotifications, isChatNotification } from './notification-separation';

describe('notification and chat separation', () => {
  it('keeps chat events out of the important notification stream', () => {
    const items = [
      { id: 'chat', type: 'chat_message', category: 'chat' },
      { id: 'task', type: 'task_assigned', category: 'task' },
      { id: 'leave', type: 'leave_approved', category: 'leave' },
    ];
    expect(isChatNotification(items[0])).toBe(true);
    expect(importantNotifications(items).map(item => item.id)).toEqual(['task', 'leave']);
  });

  it('groups unread messages, conversations, and mentions', () => {
    expect(chatActivitySummary([
      { unread_count: 4, mention_count: 1 },
      { unread_count: 0, mention_count: 0 },
      { unread_count: 2, mention_count: 2 },
    ])).toEqual({ unreadMessages: 6, unreadConversations: 2, mentions: 3 });
  });
});
