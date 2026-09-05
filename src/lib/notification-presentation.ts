export type NotificationCategory = 'inbox' | 'announcement' | 'task' | 'document' | 'leave' | 'meeting' | 'system';

export type NotificationPresentation = { category: NotificationCategory; label: string; iconLabel: string };

export const notificationPresentation: Record<NotificationCategory, NotificationPresentation> = {
  inbox: { category: 'inbox', label: 'Inbox', iconLabel: 'Notifications' },
  announcement: { category: 'announcement', label: 'Announcement', iconLabel: 'Announcement' },
  task: { category: 'task', label: 'Task', iconLabel: 'Task' },
  document: { category: 'document', label: 'Document', iconLabel: 'Document' },
  leave: { category: 'leave', label: 'Leave', iconLabel: 'Leave' },
  meeting: { category: 'meeting', label: 'Meeting', iconLabel: 'Calendar' },
  system: { category: 'system', label: 'System', iconLabel: 'Settings' },
};

const categoryAliases: Record<string, NotificationCategory> = {
  chat: 'inbox', message: 'inbox', messages: 'inbox', inbox: 'inbox',
  announcement: 'announcement', announcements: 'announcement', task: 'task', tasks: 'task',
  document: 'document', documents: 'document', leave: 'leave', leaves: 'leave',
  meeting: 'meeting', meetings: 'meeting', appointment: 'meeting', appointments: 'meeting',
  system: 'system', security: 'system', crm: 'system', finance: 'system',
};

export function presentationForNotification(item: { category?: string | null; type?: string | null; deep_link?: string | null }): NotificationPresentation {
  const category = String(item.category || '').trim().toLowerCase();
  if (categoryAliases[category]) return notificationPresentation[categoryAliases[category]];
  const type = String(item.type || '').trim().toLowerCase();
  if (type.startsWith('chat_') || type.includes('message')) return notificationPresentation.inbox;
  if (type.includes('announcement')) return notificationPresentation.announcement;
  if (type.startsWith('task_')) return notificationPresentation.task;
  if (type.includes('document')) return notificationPresentation.document;
  if (type.startsWith('leave_')) return notificationPresentation.leave;
  if (type.includes('meeting') || type.includes('appointment')) return notificationPresentation.meeting;
  const route = String(item.deep_link || '').toLowerCase();
  if (route.includes('/chat')) return notificationPresentation.inbox;
  if (route.includes('/announcements')) return notificationPresentation.announcement;
  if (route.includes('/tasks')) return notificationPresentation.task;
  if (route.includes('/documents')) return notificationPresentation.document;
  if (route.includes('/leaves')) return notificationPresentation.leave;
  if (route.includes('/meetings') || route.includes('scheduling')) return notificationPresentation.meeting;
  return notificationPresentation.system;
}
