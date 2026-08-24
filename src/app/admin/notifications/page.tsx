'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminNotificationTarget } from '@/lib/admin-notification-link';
import { adminRepository } from '@/lib/admin-repository';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { notificationPresentation, presentationForNotification, type NotificationCategory } from '@/lib/notification-presentation';
import { ModuleIcon } from '@/components/module-icon';

const formatNotificationTime = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value));

export default function AdminNotificationsPage() {
  const [profile, setProfile] = useState<any>();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<NotificationCategory | 'all'>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const current = await currentProfile() as any;
      if (!current || !['super_admin', 'chairman', 'director', 'general_manager'].includes(current.role)) throw Error('You do not have permission to view organization notifications.');
      setProfile(current); setItems(await adminRepository.notifications()); setError('');
    } catch (cause: any) { setError(cause.message); } finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const availableCategories = useMemo(() => {
    const found = new Set(items.map(presentationForNotification).map(item => item.category));
    return (Object.keys(notificationPresentation) as NotificationCategory[]).filter(category => found.has(category));
  }, [items]);
  const shown = filter === 'all' ? items : items.filter(item => presentationForNotification(item).category === filter);
  const unread = items.filter(item => !item.read_at).length;
  const markAllAsRead = async () => {
    if (!profile || !unread || markingAllRead) return;
    setMarkingAllRead(true);
    try { await employeeRepository.markAllNotificationsRead(profile.id); await load(); } finally { setMarkingAllRead(false); }
  };
  if (loading) return <section className="organization-notifications"><p className="notification-status">Loading notifications...</p></section>;
  if (error) return <section className="organization-notifications"><p className="notification-status notification-status-error">{error}</p></section>;
  return <section className="organization-notifications">
    <header className="organization-notifications-header">
      <div><h1>Organization Notifications</h1><p>Leave, documents, tasks, messages, and system activity.</p></div>
      <button className="notification-mark-all" type="button" disabled={!unread || markingAllRead} onClick={() => void markAllAsRead()}><span aria-hidden="true">✓</span>{markingAllRead ? 'Marking…' : 'Mark all as read'}</button>
    </header>
    <nav className="notification-filters" aria-label="Filter notifications">
      <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
      {availableCategories.map(category => { const presentation = notificationPresentation[category]; return <button type="button" className={filter === category ? 'active' : ''} data-category={category} onClick={() => setFilter(category)} key={category}><ModuleIcon label={presentation.iconLabel} />{presentation.label}</button>; })}
    </nav>
    <div className="notification-list">
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
    </div>
  </section>;
}
