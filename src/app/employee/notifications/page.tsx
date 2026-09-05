'use client';

import { useEffect, useState } from 'react';
import { ModuleIcon } from '@/components/module-icon';
import { NotificationPreferences } from '@/components/notification-preferences';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { chatActivitySummary, importantNotifications } from '@/lib/notification-separation';
import { presentationForNotification } from '@/lib/notification-presentation';

const safeLink = (link: string | null | undefined) => {
  const workspace = typeof window !== 'undefined' && window.location.pathname.startsWith('/clinician') ? 'clinician' : 'employee';
  if (workspace === 'clinician') {
    if (link?.startsWith('/clinician/')) return link;
    if (link?.includes('doctor-scheduling')) return link.replace(/^\/admin\/doctor-scheduling|^\/employee\/doctor-scheduling/, '/clinician/schedule');
    return '/clinician/notifications';
  }
  if (link?.startsWith('/employee/')) return link;
  if (link?.startsWith('/admin/doctor-scheduling')) return link.replace('/admin/doctor-scheduling', '/employee/doctor-scheduling');
  return '/employee/notifications';
};

export default function NotificationsPage() {
  const [profile, setProfile] = useState<any>();
  const [items, setItems] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [stream, setStream] = useState<'important' | 'chat'>('important');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<any>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const current = await currentProfile() as any;
      if (!current) throw new Error('Your session has expired.');
      const notifications = await employeeRepository.notifications(current.id);
      let chat: any[] = [];
      try { chat = await employeeRepository.conversations(current.id); } catch { /* Chat remains reachable without its summary. */ }
      setProfile(current); setItems(notifications); setConversations(chat); setError('');
    } catch (caught: any) {
      setError(caught.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const read = async (item: any) => {
    if (!item.read_at && profile) {
      await employeeRepository.markNotificationRead(item.id, profile.id);
      setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    }
    setDetail(item);
  };
  const important = importantNotifications(items);
  const shown = important.filter(item => `${item.title || ''} ${item.body || ''}`.toLowerCase().includes(query.toLowerCase()));
  const unread = important.filter(item => !item.read_at).length;
  const chatSummary = chatActivitySummary(conversations);
  const chatHref = '/employee/chat';
  const markAllRead = async () => {
    if (!profile || !unread || markingAll) return;
    setMarkingAll(true);
    try {
      await Promise.all(important.filter(item => !item.read_at).map(item => employeeRepository.markNotificationRead(item.id, profile.id)));
      await load();
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) return <section className="organization-notifications"><p className="notification-status">Loading notifications...</p></section>;
  if (error && !profile) return <section className="organization-notifications"><p className="notification-status notification-status-error">{error}</p></section>;
  return <section className="organization-notifications">
    <header className="organization-notifications-header">
      <div><h1>Notifications</h1><p>Important updates only. Chat activity stays separate.</p></div>
      <div className="notification-header-actions"><button type="button" onClick={() => setPreferencesOpen(current => !current)}>Sound settings</button><button className="notification-mark-all" type="button" disabled={!unread || markingAll} onClick={() => void markAllRead()}>{markingAll ? 'Marking…' : 'Mark all read'}</button></div>
    </header>
    {preferencesOpen && profile && <NotificationPreferences userId={profile.id} />}
    {error && <p className="notification-status notification-status-error">{error}</p>}
    <nav className="notification-stream-tabs" aria-label="Notification streams">
      <button type="button" className={stream === 'important' ? 'active' : ''} onClick={() => setStream('important')}><ModuleIcon label="Notifications" />Important <span>{unread}</span></button>
      <button type="button" className={stream === 'chat' ? 'active' : ''} onClick={() => setStream('chat')}><ModuleIcon label="Chat" />Chat <span>{chatSummary.unreadMessages}</span></button>
    </nav>
    {stream === 'important' ? <>
      <label className="notification-search"><span className="sr-only">Search important notifications</span><ModuleIcon label="Search" /><input placeholder="Search important notifications" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="notification-list">{shown.map(item => { const presentation = presentationForNotification(item); return <button type="button" onClick={() => void read(item)} className={`notification-card notification-${presentation.category}${item.read_at ? '' : ' unread'}`} key={item.id}><ModuleIcon label={presentation.iconLabel} className="notification-icon" /><span className="notification-copy"><span className="notification-category">{presentation.label}</span><b>{item.title || 'New update'}</b>{item.body && <p>{item.body}</p>}<small>{new Date(item.created_at).toLocaleString()}</small></span>{!item.read_at && <span className="notification-unread-dot" aria-label="Unread" />}</button>; })}{!shown.length && <p className="notification-empty">{important.length ? 'No important notifications match your search.' : 'No important notifications.'}</p>}</div>
    </> : <section className="notification-chat-handoff"><ModuleIcon label="Chat" /><div><h2>Chat activity</h2><p>{chatSummary.unreadMessages ? `${chatSummary.unreadMessages} unread messages in ${chatSummary.unreadConversations} conversations.` : 'No unread conversations.'}</p>{chatSummary.mentions > 0 && <small>{chatSummary.mentions} unread mention{chatSummary.mentions === 1 ? '' : 's'}</small>}</div><a href={chatHref}>Open chat <ModuleIcon label="Open related" /></a></section>}
    {detail && <section className="notification-detail"><button type="button" onClick={() => setDetail(null)}>Close</button><h2>{detail.title}</h2><p>{detail.body}</p>{detail.deep_link && <a href={safeLink(detail.deep_link)}>Open related item</a>}</section>}
  </section>;
}
