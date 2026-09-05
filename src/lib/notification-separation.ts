import { presentationForNotification } from './notification-presentation';

export const isChatNotification = (item: { category?: string | null; type?: string | null; deep_link?: string | null }) =>
  presentationForNotification(item).category === 'inbox';

export const importantNotifications = <T extends { category?: string | null; type?: string | null; deep_link?: string | null }>(items: T[]) =>
  items.filter(item => !isChatNotification(item));

export const chatActivitySummary = (conversations: any[]) => ({
  unreadMessages: conversations.reduce((total, item) => total + Number(item.unread_count || 0), 0),
  unreadConversations: conversations.filter(item => Number(item.unread_count || 0) > 0).length,
  mentions: conversations.reduce((total, item) => total + Number(item.mention_count || 0), 0),
});
