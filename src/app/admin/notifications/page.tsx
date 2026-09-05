'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminNotificationTarget } from '@/lib/admin-notification-link';
import { adminRepository } from '@/lib/admin-repository';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { notificationPresentation, presentationForNotification, type NotificationCategory } from '@/lib/notification-presentation';
import { ModuleIcon } from '@/components/module-icon';
import { chatActivitySummary, importantNotifications } from '@/lib/notification-separation';

const formatNotificationTime = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));

export default function AdminNotificationsPage() {
  const [profile, setProfile] = useState<any>();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<NotificationCategory | 'all'>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [stream, setStream] = useState<'important' | 'chat'>('important');
  const [conversations, setConversations] = useState<any[]>([]);
  const load = async () => {
    setLoading(true);
    try {
      const current = await currentProfile() as any;
      if (!current || !['super_admin', 'chairman', 'director', 'general_manager'].includes(current.role)) throw Error('You do not have permission to view organization notifications.');
      const notifications = await adminRepository.notifications();
      let chat: any[] = [];
      try { chat = await employeeRepository.conversations(current.id); } catch { /* Chat remains reachable without its summary. */ }
      setProfile(current); setItems(notifications); setConversations(chat); setError('');
    } catch (cause: any) { setError(cause.message); } finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const important = importantNotifications(items);
  const availableCategories = useMemo(() => {
    const found = new Set(importantNotifications(items).map(presentationForNotification).map(item => item.category));
    return (Object.keys(notificationPresentation) as NotificationCategory[]).filter(category => found.has(category));
  }, [items]);
  const shown = filter === 'all' ? important : important.filter(item => presentationForNotification(item).category === filter);
  const unread = important.filter(item => !item.read_at).length;
  const chatSummary = chatActivitySummary(conversations);
  const markAllAsRead = async () => {
    if (!profile || !unread || markingAllRead) return;
    setMarkingAllRead(true);
    try { await Promise.all(important.filter(item => !item.read_at).map(item => employeeRepository.markNotificationRead(item.id, profile.id))); await load(); } finally { setMarkingAllRead(false); }
  };
  if (loading) return <section className="organization-notifications"><p className="notification-status">Loading notifications...</p></section>;
  if (error) return <section className="organization-notifications"><p className="notification-status notification-status-error">{error}</p></section>;
  return <section className="organization-notifications">
    <header className="organization-notifications-header">
      <div><h1>Notifications</h1><p>Important operational and workflow updates.</p></div>
      <button className="notification-mark-all" type="button" disabled={!unread || markingAllRead} onClick={() => void markAllAsRead()}><ModuleIcon label="Approval" />{markingAllRead ? 'Marking…' : 'Mark all as read'}</button>
    </header>
    <nav className="notification-stream-tabs" aria-label="Notification streams">
      <button type="button" className={stream === 'important' ? 'active' : ''} onClick={() => setStream('important')}><ModuleIcon label="Notifications" />Important <span>{unread}</span></button>
      <button type="button" className={stream === 'chat' ? 'active' : ''} onClick={() => setStream('chat')}><ModuleIcon label="Chat" />Chat <span>{chatSummary.unreadMessages}</span></button>
    </nav>
    {stream === 'important' && <nav className="notification-filters" aria-label="Filter important notifications">
      <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
      {availableCategories.map(category => { const presentation = notificationPresentation[category]; return <button type="button" className={filter === category ? 'active' : ''} data-category={category} onClick={() => setFilter(category)} key={category}><ModuleIcon label={presentation.iconLabel} />{presentation.label}</button>; })}
    </nav>}
    {stream === 'chat' ? <section className="notification-chat-handoff"><ModuleIcon label="Chat" /><div><h2>Chat activity</h2><p>{chatSummary.unreadMessages ? `${chatSummary.unreadMessages} unread messages in ${chatSummary.unreadConversations} conversations.` : 'No unread conversations.'}</p>{chatSummary.mentions > 0 && <small>{chatSummary.mentions} unread mention{chatSummary.mentions === 1 ? '' : 's'}</small>}</div><a href="/admin/chat">Open chat <ModuleIcon label="Open related" /></a></section> : <div className="notification-list">
      {shown.map(item => {
        const presentation = presentationForNotification(item);
        const destination = item.deep_link ? adminNotificationTarget(item.deep_link) : null;
        return <article className={`notification-card notification-${presentation.category}${item.read_at ? '' : ' unread'}`} key={item.id}>
          <ModuleIcon label={presentation.iconLabel} className="notification-icon" />
          <div className="notification-copy"><span className="notification-category">{presentation.label}</span><h2>{item.title}</h2>{item.body && <p>{item.body}</p>}<small>To: {item.recipient?.full_name || 'Employee'} <span aria-hidden="true">•</span> {formatNotificationTime(item.created_at)}</small></div>
          {!item.read_at && <span className="notification-unread-dot" aria-label="Unread" />}
          {destination && <a className="notification-open-related" href={destination}>Open related item <span aria-hidden="true">›</span></a>}
        </article>;
      })}
      {!shown.length && <p className="notification-empty">{items.length ? 'No notifications in this category.' : 'No organization notifications.'}</p>}
    </div>}
  </section>;
}
