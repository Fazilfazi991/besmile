'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { employeeRepository } from '@/lib/employee-repository';
import { notificationAudioIsUnlocked, playNotificationSound, unlockNotificationAudio } from '@/lib/notification-audio';
import { chatActivitySummary, importantNotifications, isChatNotification } from '@/lib/notification-separation';
import { presentationForNotification } from '@/lib/notification-presentation';
import { ModuleIcon } from '@/components/module-icon';

type Mode = 'admin' | 'employee';
type Result = {
  id: string;
  label: string;
  detail: string;
  category: string;
  href: string;
};
const navigation = {
  admin: [
    ['Dashboard', '/admin'],
    ['Employees', '/admin/employees'],
    ['Tasks', '/admin/tasks'],
    ['Documents', '/admin/documents'],
    ['Teams', '/admin/chat'],
    ['CRM', '/admin/crm'],
    ['Finance', '/admin/finance'],
    ['Invoices', '/admin/finance/invoices'],
    ['Payroll', '/admin/finance/payroll'],
    ['Reports', '/admin/finance/reports'],
    ['Roles & Access', '/admin/access']
  ],
  employee: [
    ['Dashboard', '/employee/dashboard'],
    ['Attendance', '/employee/attendance'],
    ['Leave', '/employee/leaves'],
    ['Tasks', '/employee/tasks'],
    ['Documents', '/employee/documents'],
    ['Announcements', '/employee/announcements'],
    ['Teams', '/employee/chat'],
    ['Profile', '/employee/profile'],
    ['CRM', '/employee/crm'],
    ['My leads', '/employee/crm/leads'],
    ['My follow-ups', '/employee/crm/follow-ups'],
    ['My sales', '/employee/crm/sales']
  ]
} as const;
const safeRoute = (mode: Mode, link?: string | null) => (link?.startsWith(`/${mode}/`) ? link : `/${mode}/notifications`);
const notificationRoute = (mode: Mode, item: any) => {
  const entityId = item.related_entity_id || item.entity_id || item.metadata?.entity_id;
  if (entityId && String(item.type || '').startsWith('leave_')) return mode === 'admin' ? `/admin/leaves?request=${entityId}` : `/employee/leaves?request=${entityId}`;
  return safeRoute(mode, item.destination_url || item.deep_link || item.metadata?.destination_url);
};
const relative = (value: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? 'Now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : new Date(value).toLocaleDateString();
};

export function GlobalCommandCenter({ mode, userId, canInvoices = false, canEmployees = false, canCrm = false }: { mode: Mode; userId: string; canInvoices?: boolean; canEmployees?: boolean; canCrm?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [recent, setRecent] = useState<Result[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [notificationTab, setNotificationTab] = useState<'important' | 'chat'>('important');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const playedNotificationIds = useRef(new Set<string>());
  const playedSoundEvents = useRef(new Set<string>());
  const openingNotificationIds = useRef(new Set<string>());
  const markingAllNotifications = useRef(false);
  const storageKey = `bsmile:recent:${userId}`;
  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await employeeRepository.notifications(userId, 0, 12));
    } catch {
      /* The notification page exposes a recoverable error state. */
    }
  }, [userId]);
  const loadChatActivity = useCallback(async () => {
    try {
      setConversations(await employeeRepository.conversations(userId));
    } catch {
      /* Chat remains accessible even if its summary cannot be loaded. */
    }
  }, [userId]);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    } catch {
      setRecent([]);
    }
    void Promise.all([loadNotifications(), loadChatActivity()]);
  }, [loadChatActivity, loadNotifications, storageKey]);
  useEffect(() => {
    const unlock = () => {
      void unlockNotificationAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        setBellOpen(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`notification-sounds:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${userId}`
        },
        async ({ new: item }: { new: any }) => {
          if (!item?.id || playedNotificationIds.current.has(item.id)) return;
          playedNotificationIds.current.add(item.id);
          setNotifications((current) => [item, ...current.filter((row) => row.id !== item.id)].slice(0, 12));
          if (isChatNotification(item)) void loadChatActivity();
          const soundKey = `${item.type}:${item.related_entity_id || item.id}`;
          if (playedSoundEvents.current.has(soundKey)) return;
          const { data: settings } = await supabase.from('notification_preferences').select('*').eq('profile_id', userId).maybeSingle();
          if (!notificationAudioIsUnlocked() || !item.sound_enabled || item.sound_type === 'none' || !settings?.sounds_enabled || settings.muted || settings.category_settings?.[item.category]?.sound === false) return;
          playedSoundEvents.current.add(soundKey);
          await playNotificationSound();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadChatActivity, userId]);
  useEffect(() => {
    if (!supabase) return;
    const playFeatureSound = async (category: string, eventKey: string) => {
      if (playedSoundEvents.current.has(eventKey) || !notificationAudioIsUnlocked()) return;
      const { data: settings } = await supabase.from('notification_preferences').select('*').eq('profile_id', userId).maybeSingle();
      if (!settings?.sounds_enabled || settings.muted || settings.category_settings?.[category]?.sound === false) return;
      playedSoundEvents.current.add(eventKey);
      await playNotificationSound();
    };
    const channel = supabase
      .channel(`feature-sounds:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload: any) => {
        const message = payload.new;
        const recipientMatched = Boolean(message?.id && message.sender_id !== userId);
        if (!recipientMatched) return;
        const eventKey = `chat_message:${message.id}`;
        if (playedSoundEvents.current.has(eventKey)) return;
        await playFeatureSound('chat', eventKey);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, async (payload: any) => {
        const announcement = payload.new;
        const audienceMatched = Boolean(announcement?.id && announcement.author_id !== userId);
        const eventKey = `new_announcement:${announcement?.id}`;
        const isDuplicate = playedSoundEvents.current.has(eventKey);
        if (!audienceMatched || isDuplicate || announcement.category !== 'urgent') return;
        await playFeatureSound('announcements', eventKey);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 20);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        if (!supabase) throw new Error('Search is unavailable.');
        const pattern = `%${term}%`;
        const batches: any[] = [];
        if (canEmployees) batches.push(supabase.from('profiles').select('id,full_name,email,designation,employee_code,status,department:departments(name)').eq('is_employee', true).eq('workforce_visible', true).neq('role', 'director').eq('login_enabled', true).eq('status', 'active').or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},employee_code.ilike.${pattern}`).limit(5));
        else batches.push(supabase.from('profiles').select('id,full_name,email,designation,status,department:departments(name)').eq('id', userId).ilike('full_name', pattern).limit(1));
        if (canCrm) batches.push(supabase.from('crm_leads').select('id,full_name,phone,status:crm_lead_statuses(name)').or(`full_name.ilike.${pattern},phone.ilike.${pattern}`).is('archived_at', null).limit(5));
        else batches.push(supabase.from('crm_leads').select('id,full_name,phone,status:crm_lead_statuses(name)').eq('assigned_to', userId).or(`full_name.ilike.${pattern},phone.ilike.${pattern}`).is('archived_at', null).limit(5));
        if (canInvoices) batches.push(supabase.from('finance_invoices').select('id,invoice_number,customer_name,status').or(`invoice_number.ilike.${pattern},customer_name.ilike.${pattern}`).is('archived_at', null).limit(5));
        const [people, leads, invoices] = await Promise.all(batches);
        if (cancelled) return;
        const next: Result[] = [];
        if (people.data)
          next.push(
            ...people.data.map((row: any) => ({
              id: `employee-${row.id}`,
              label: row.full_name || row.email,
              detail: `${row.designation || row.role || 'Employee'} · ${row.department?.name || row.status || ''}`,
              category: 'Employees',
              href: canEmployees ? `/admin/employees/${row.id}` : '/employee/profile'
            }))
          );
        if (leads.data)
          next.push(
            ...leads.data.map((row: any) => ({
              id: `lead-${row.id}`,
              label: row.full_name,
              detail: `${row.phone || 'No phone'} · ${row.status?.name || 'Lead'}`,
              category: 'Leads',
              href: mode === 'admin' ? `/admin/crm/leads/${row.id}` : `/employee/crm/leads/${row.id}`
            }))
          );
        if (invoices?.data)
          next.push(
            ...invoices.data.map((row: any) => ({
              id: `invoice-${row.id}`,
              label: row.invoice_number,
              detail: `${row.customer_name} · ${row.status}`,
              category: 'Invoices',
              href: '/admin/finance/invoices'
            }))
          );
        next.push(
          ...navigation[mode]
            .filter(([label]) => label.toLowerCase().includes(term.toLowerCase()))
            .slice(0, 5)
            .map(([label, href]) => ({
              id: `nav-${href}`,
              label: `Go to ${label}`,
              detail: 'Navigation',
              category: 'Navigation',
              href
            }))
        );
        setResults(next);
        setIndex(0);
      } catch {
        if (!cancelled) {
          setError('Search is temporarily unavailable. Please try again.');
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, mode, userId, canEmployees, canCrm, canInvoices]);
  const visible = query.trim()
    ? results
    : recent.length
      ? recent
      : navigation[mode].slice(0, 7).map(([label, href]) => ({
          id: `nav-${href}`,
          label: `Go to ${label}`,
          detail: 'Navigation',
          category: 'Navigation',
          href
        }));
  const choose = (result: Result) => {
    const next = [result, ...recent.filter((item) => item.href !== result.href)].slice(0, 6);
    setRecent(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setOpen(false);
    router.push(result.href);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!visible.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((current) => (current + 1) % visible.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((current) => (current - 1 + visible.length) % visible.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(visible[index] || visible[0]);
    }
  };
  const important = importantNotifications(notifications);
  const unread = important.filter((item) => !item.read_at).length;
  const chatSummary = chatActivitySummary(conversations);
  const markRead = async (item: any) => {
    if (openingNotificationIds.current.has(item.id)) return;
    openingNotificationIds.current.add(item.id);
    const readAt = new Date().toISOString();
    const destination = notificationRoute(mode, item);
    if (!item.read_at) setNotifications((current) => current.map((row) => (row.id === item.id ? { ...row, read_at: readAt } : row)));
    setBellOpen(false);
    try {
      if (!item.read_at) await employeeRepository.markNotificationRead(item.id, userId);
    } catch (cause) {
      console.warn('[Notifications] mark read failed', cause);
    } finally {
      router.push(destination);
      window.setTimeout(() => router.refresh(), 0);
      window.setTimeout(() => openingNotificationIds.current.delete(item.id), 1200);
    }
  };
  const markAll = async () => {
    if (markingAllNotifications.current) return;
    markingAllNotifications.current = true;
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((row) => isChatNotification(row) ? row : ({ ...row, read_at: row.read_at || readAt })));
    try {
      await Promise.all(important.filter((item) => !item.read_at).map((item) => employeeRepository.markNotificationRead(item.id, userId)));
      router.refresh();
    } catch (cause) {
      setNotifications(previous);
      console.warn('[Notifications] mark all read failed; optimistic state rolled back', cause);
    } finally {
      markingAllNotifications.current = false;
    }
  };
  return (
    <div className="global-command-center">
      <button className="global-search-trigger" aria-label="Search workspace" onClick={() => setOpen(true)}>
        <svg className="header-icon header-icon-search" aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <span className="hidden lg:inline">Search employees, leads, tasks, invoices…</span>
        <kbd className="hidden lg:inline">Ctrl K</kbd>
      </button>
      <button className="global-bell" aria-label="Open notifications" aria-expanded={bellOpen} onClick={() => setBellOpen((current) => !current)}>
        <svg className="header-icon header-icon-bell" aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
      </button>
      {bellOpen && (
        <section className="global-notifications" aria-label="Notifications">
          <header className="global-notifications-header">
            <div>
              <b>Notifications</b>
              <p>Important updates only</p>
            </div>
            {unread > 0 && (
              <button className="global-notifications-mark" onClick={() => void markAll()}>
                Mark all read
              </button>
            )}
          </header>
          <div className="global-notification-tabs" role="tablist" aria-label="Notification streams">
            <button role="tab" aria-selected={notificationTab === 'important'} className={notificationTab === 'important' ? 'active' : ''} onClick={() => setNotificationTab('important')}><ModuleIcon label="Notifications" />Important <span>{unread}</span></button>
            <button role="tab" aria-selected={notificationTab === 'chat'} className={notificationTab === 'chat' ? 'active' : ''} onClick={() => setNotificationTab('chat')}><ModuleIcon label="Chat" />Chat <span>{chatSummary.unreadMessages}</span></button>
          </div>
          {notificationTab === 'important' ? <div className="global-notification-list" role="tabpanel">
            {important.length ? important.slice(0, 6).map((item) => (
              <button className={`global-notification-item${item.read_at ? '' : ' unread'}`} onClick={() => void markRead(item)} key={item.id}>
                <ModuleIcon label={presentationForNotification(item).iconLabel} />
                <span className="global-notification-copy"><b>{item.title || 'New update'}</b><span>{item.body || item.message || 'Open to view details.'}</span><small>{relative(item.created_at)}</small></span>
                {!item.read_at && <i aria-label="Unread" />}
              </button>
            )) : <div className="global-notification-empty"><ModuleIcon label="Approval" /><b>No important notifications</b><p>You’re all caught up.</p></div>}
          </div> : <div className="global-chat-summary" role="tabpanel">
            <ModuleIcon label="Chat" />
            <div><b>Chat activity</b><p>{chatSummary.unreadMessages ? `${chatSummary.unreadMessages} unread message${chatSummary.unreadMessages === 1 ? '' : 's'} in ${chatSummary.unreadConversations} conversation${chatSummary.unreadConversations === 1 ? '' : 's'}` : 'No unread conversations'}{chatSummary.mentions ? ` · ${chatSummary.mentions} mention${chatSummary.mentions === 1 ? '' : 's'}` : ''}</p></div>
            <button onClick={() => { setBellOpen(false); router.push(`/${mode}/chat`); }}>Open chat <ModuleIcon label="Open related" /></button>
          </div>}
          <button
            className="global-notifications-footer"
            onClick={() => {
              setBellOpen(false);
              router.push(`/${mode}/notifications`);
            }}
          >
            View all notifications
          </button>
        </section>
      )}
      {open && (
        <div className="global-search-backdrop" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={() => setOpen(false)}>
          <section className="global-search-panel" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-slate-100 p-3">
              <svg className="header-icon header-icon-search text-slate-500" aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input ref={input} className="min-w-0 flex-1 bg-transparent text-base outline-none" placeholder="Search employees, leads, invoices, or navigation…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={keyDown} />
              <button className="text-sm text-slate-500" onClick={() => setQuery('')}>
                Clear
              </button>
              <kbd>Esc</kbd>
            </div>
            <div className="max-h-[65vh] overflow-auto p-2">
              {loading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((item) => (
                    <div className="h-12 animate-pulse rounded bg-slate-100" key={item} />
                  ))}
                </div>
              ) : error ? (
                <div className="p-6 text-center text-sm text-rose-700">{error}</div>
              ) : visible.length ? (
                visible.map((result, resultIndex) => (
                  <button className={`block w-full rounded-lg p-3 text-left ${resultIndex === index ? 'bg-teal-50' : 'hover:bg-slate-50'}`} onMouseEnter={() => setIndex(resultIndex)} onClick={() => choose(result)} key={result.id}>
                    <div className="flex items-center justify-between gap-3">
                      <b>{result.label}</b>
                      <small className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{result.category}</small>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-500">{result.detail}</p>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center">
                  <b>No matching records found.</b>
                  <p className="mt-1 text-sm text-slate-500">Try a name, phone number, reference, or invoice number.</p>
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
              ↑ ↓ to navigate · Enter to open · Esc to close{' '}
              {recent.length ? (
                <button
                  className="ml-3 font-semibold text-teal-700"
                  onClick={() => {
                    setRecent([]);
                    localStorage.removeItem(storageKey);
                  }}
                >
                  Clear recent searches
                </button>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
