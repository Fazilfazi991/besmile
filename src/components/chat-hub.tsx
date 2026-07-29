'use client';
/* Switching conversations intentionally clears the previous message state before loading. */
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { supabase } from '@/lib/supabase';
import { mergeChatMessages, upsertChatMessage } from '@/lib/chat-message-state';
import './chat-hub-fixes.css';

type Tab = 'all' | 'personal' | 'group' | 'unread';

const time = (value?: string) => value ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';
const size = (value?: number) => !value ? '' : value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;

export function ChatHub() {
  const [profile, setProfile] = useState<any>();
  const [conversations, setConversations] = useState<any[]>([]);
  const [active, setActive] = useState<any>();
  const [messages, setMessages] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [mode, setMode] = useState<'chooser' | 'direct' | 'group'>('chooser');
  const [selectedPerson, setSelectedPerson] = useState<any>();
  const [people, setPeople] = useState<any[]>([]);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [group, setGroup] = useState({ title: '', description: '', type: 'general', members: [] as string[] });
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messageRequest = useRef(0);

  const load = async (selectedId?: string) => {
    try {
      const me = profile || await currentProfile() as any;
      if (!me) throw new Error('Your session has expired.');
      setProfile(me);
      const list = await employeeRepository.conversations(me.id);
      setConversations(list);
      const next = selectedId ? list.find((item: any) => item.conversation_id === selectedId) : list.find((item: any) => item.conversation_id === active?.conversation_id) || list[0];
      setActive(next || null);
      setError('');
    } catch (cause: any) { console.error(cause); setError('Chat could not be loaded. Please refresh the page or try again shortly.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    if (!active || !profile) return;
    let alive = true;
    const requestId = ++messageRequest.current;
    setMessages([]);
    setError('');
    const loadMessages = async () => {
      try {
        const rows = await employeeRepository.chatMessages(active.conversation_id);
        if (!alive || requestId !== messageRequest.current) return;
        setMessages(rows.filter((message: any) => message.conversation_id === active.conversation_id));
        await employeeRepository.markConversationRead(active.conversation_id, profile.id);
        setConversations(list => list.map(item => item.conversation_id === active.conversation_id ? { ...item, unread_count: 0 } : item));
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 20);
      } catch (cause: any) { if (alive && requestId === messageRequest.current) setError(cause.message); }
    };
    void loadMessages();
    const channel = supabase?.channel(`chat-${active.conversation_id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${active.conversation_id}` }, (event: any) => {
      setMessages(rows => upsertChatMessage(rows, event.new as any));
      if (event.new.sender_id !== profile.id) void employeeRepository.markConversationRead(active.conversation_id, profile.id);
    }).subscribe();
    return () => { alive = false; if (channel) supabase?.removeChannel(channel); };
  }, [active?.conversation_id, profile?.id]);
  useEffect(() => {
    if (!newChat || !profile) return;
    const timer = setTimeout(() => { void employeeRepository.chatPeople(peopleQuery).then(rows => setPeople(rows.filter((person: any) => person.id !== profile.id))).catch(cause => setError(cause.message)); }, 180);
    return () => clearTimeout(timer);
  }, [newChat, peopleQuery, profile?.id]);

  const visible = useMemo(() => conversations.filter(item => {
    const name = chatName(item, profile?.id).toLowerCase();
    const preview = `${item.latest_message?.body || ''} ${item.latest_message?.attachment_name || ''}`.toLowerCase();
    return (tab === 'all' || item.chat_conversations.conversation_type === tab || (tab === 'unread' && item.unread_count > 0)) && `${name} ${preview}`.includes(query.toLowerCase());
  }), [conversations, tab, query, profile?.id]);
  const matchingMessages = useMemo(() => !messageQuery ? messages : messages.filter(message => `${message.body || ''} ${message.attachment_name || ''} ${message.sender?.full_name || ''}`.toLowerCase().includes(messageQuery.toLowerCase())), [messages, messageQuery]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!active || !profile || sending || (!text.trim() && !file)) return;
    const channelId = active.chat_conversations?.channel_id;
    if (!channelId) { setError('Message could not be sent because the conversation was not ready. Please reopen the chat and try again.'); return; }
    const clientMessageId = crypto.randomUUID();
    const pending = { id: `pending-${clientMessageId}`, client_message_id: clientMessageId, sender_id: profile.id, body: text.trim(), created_at: new Date().toISOString(), attachment_name: file?.name, attachment_size: file?.size, status: 'sending' };
    setSending(true); setError(''); setMessages(rows => [...rows, pending]); setText(''); setFile(null);
    try { const saved = await employeeRepository.sendMessage({ conversation_id: active.conversation_id, channel_id: channelId, sender_id: profile.id, body: pending.body, client_message_id: clientMessageId, file }); setMessages(rows => upsertChatMessage(rows, saved)); }
    catch (cause: any) { setMessages(rows => rows.map(row => row.id === pending.id ? { ...row, status: 'failed' } : row)); setError('Message could not be sent. Please try again.'); console.error(cause); }
    finally { setSending(false); }
  };
  const submitKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } };
  const create = async (person?: any) => {
    try {
      const id = mode === 'direct' ? await employeeRepository.createPersonalChat(profile.id, person.id) : await employeeRepository.createGroupChat(profile.id, group.title, group.members, group.description, group.type);
      setNewChat(false); setSelectedPerson(undefined); setGroup({ title: '', description: '', type: 'general', members: [] }); await load(id);
    } catch (cause: any) { setError('Chat could not be created. Please try again shortly.'); console.error(cause); }
  };
  const switchConversation = (item: any) => { messageRequest.current++; setMessages([]); setError(''); setActive(item); setDetails(false); setMessageQuery(''); };
  if (loading) return <div className="chat-skeleton"><div /><div /></div>;
  if (!profile) return <section className="chat-state"><h1>Internal Chat</h1><p>{error || 'Sign in to use chat.'}</p></section>;
  const isGroup = active?.chat_conversations?.conversation_type === 'group';
  const isAdmin = active?.chat_conversations?.group_admin_id === profile.id;
  const members = active?.chat_conversations?.chat_members || [];

  return <section className={`chat-hub ${active ? 'chat-open' : ''}`}>
    <header className="employee-page-header chat-page-header"><div><p className="eyebrow">COMMUNICATION</p><h1>Internal Chat</h1><p>Private conversations and team communication for active employees.</p></div><button className="btn btn-primary" onClick={() => { setMode('chooser'); setSelectedPerson(undefined); setNewChat(true); }}>+ New conversation</button></header>
    {error && <p className="employee-banner dashboard-error">{error}</p>}
    <div className="chat-layout">
      <aside className="chat-conversation-panel"><div className="chat-panel-top"><div><h2>Messages</h2><small>{conversations.reduce((total, item) => total + (item.unread_count || 0), 0)} unread</small></div><button onClick={() => { setMode('chooser'); setSelectedPerson(undefined); setNewChat(true); }} aria-label="New conversation">+</button></div><input className="input chat-search" placeholder="Search conversations" value={query} onChange={event => setQuery(event.target.value)} /><div className="chat-tabs">{(['all', 'personal', 'group', 'unread'] as Tab[]).map(value => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{value === 'personal' ? 'Direct' : value[0].toUpperCase() + value.slice(1)}</button>)}</div><div className="chat-conversation-list">{visible.map(item => <button className={`chat-conversation ${active?.conversation_id === item.conversation_id ? 'active' : ''}`} onClick={() => switchConversation(item)} key={item.conversation_id}><Avatar name={chatName(item, profile.id)} /><div><b>{chatName(item, profile.id)}</b><small>{item.latest_message?.body || item.latest_message?.attachment_name || 'No messages yet'}</small></div><aside><time>{time(item.latest_message?.created_at)}</time>{item.unread_count > 0 && <span>{item.unread_count > 99 ? '99+' : item.unread_count}</span>}</aside></button>)}{!visible.length && <Empty title={query ? 'No matching conversations' : 'No conversations yet'} text={query ? 'Try another search.' : 'Start a direct message or create a group.'} />}</div></aside>
      <main className="chat-message-panel">{active ? <><header className="chat-message-header"><button className="chat-back" onClick={() => setActive(null)}>Back</button><Avatar name={chatName(active, profile.id)} /><div><h2>{chatName(active, profile.id)}</h2><small>{isGroup ? `${members.length} members - ${active.chat_conversations.group_type || 'group'}` : other(active, profile.id)?.designation || 'Direct conversation'}</small></div><div className="chat-header-actions"><button onClick={() => setMessageQuery(value => value ? '' : ' ')}>Search</button><button onClick={() => setDetails(value => !value)}>Details</button></div></header>{messageQuery !== '' && <div className="chat-message-search"><input className="input" autoFocus placeholder="Search messages, people, or files" value={messageQuery === ' ' ? '' : messageQuery} onChange={event => setMessageQuery(event.target.value)} /><button onClick={() => setMessageQuery('')}>Close</button></div>}<div className="chat-messages" ref={scrollRef}>{matchingMessages.map((message, index) => <Message key={message.id} message={message} own={message.sender_id === profile.id} sender={isGroup && message.sender_id !== profile.id && messages[index - 1]?.sender_id !== message.sender_id} />)}{!messages.length && <Empty title="No messages yet" text="Send the first message to start this conversation." />}{!!messageQuery && !matchingMessages.length && <Empty title="No messages found" text="Search message text, senders, or attachment names." />}</div><form className="chat-composer" onSubmit={send}>{file && <span className="chat-file-chip">{file.name}<button type="button" onClick={() => setFile(null)}>x</button></span>}{!active.chat_conversations?.channel_id && <small className="chat-composer-warning">Conversation is preparing. Reopen this chat before sending a message.</small>}<textarea className="input" rows={1} placeholder="Write a message" value={text} onChange={event => setText(event.target.value)} onKeyDown={submitKey} disabled={sending || !active.chat_conversations?.channel_id} /><input ref={fileRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} /><button type="button" className="chat-attach" onClick={() => fileRef.current?.click()} disabled={sending || !active.chat_conversations?.channel_id}>Attach</button><button className="btn btn-primary" disabled={sending || !active.chat_conversations?.channel_id || (!text.trim() && !file)}>{sending ? 'Sending...' : 'Send'}</button><small>Images, PDF, Word, and Excel files up to 10 MB</small></form></> : <Empty title="Choose a conversation" text="Select a conversation from the list, or start a new chat." />}</main>
      {active && details && <aside className="chat-details-panel"><div className="chat-details-heading"><h2>Conversation details</h2><button onClick={() => setDetails(false)}>Close</button></div><Avatar name={chatName(active, profile.id)} large /><h3>{chatName(active, profile.id)}</h3>{isGroup ? <><p>{active.chat_conversations.description || 'No group description.'}</p><div className="chat-detail-section"><div><b>Members</b>{isAdmin && <button onClick={() => { setMode('group'); setNewChat(true); }}>Add member</button>}</div>{members.map((member: any) => <Member key={member.profile_id} member={member} admin={isAdmin} own={member.profile_id === profile.id} conversationId={active.conversation_id} refresh={() => load(active.conversation_id)} report={setError} />)}</div><button className="chat-leave" onClick={() => void employeeRepository.manageChatMember(active.conversation_id, profile.id, 'remove').then(() => load()).catch(cause => setError(cause.message))}>Leave group</button></> : <><p>{other(active, profile.id)?.designation || 'Employee'} - {other(active, profile.id)?.department?.name || 'No department'}</p><div className="chat-detail-section"><b>Shared files</b>{messages.filter(message => message.attachment_name).slice(-6).map(message => <MessageFile key={message.id} message={message} />)}{!messages.some(message => message.attachment_name) && <small>No files shared yet.</small>}</div></>}</aside>}
    </div>
    {newChat && <div className="chat-modal-backdrop"><section className="chat-modal">
      {mode === 'chooser' ? <><header><div><h2>Start a conversation</h2><p>Choose how you would like to communicate.</p></div><button onClick={() => setNewChat(false)}>Close</button></header><div className="chat-choice-grid"><button onClick={() => setMode('direct')}><span>DM</span><b>Direct message</b><small>Chat privately with one employee</small></button><button onClick={() => setMode('group')}><span>GR</span><b>New group</b><small>Create a team or department conversation</small></button></div></> : <><header><div><h2>{mode === 'direct' ? 'New direct message' : 'New group'}</h2><p>{mode === 'direct' ? 'Choose an active employee to start a private conversation.' : 'Add at least two active employees to your group.'}</p></div><button onClick={() => setNewChat(false)}>Close</button></header>
      {mode === 'group' && <div className="chat-group-fields"><input className="input" placeholder="Group name *" value={group.title} onChange={event => setGroup({ ...group, title: event.target.value })} /><input className="input" placeholder="Description (optional)" value={group.description} onChange={event => setGroup({ ...group, description: event.target.value })} /><select className="input" value={group.type} onChange={event => setGroup({ ...group, type: event.target.value })}><option value="general">General</option><option value="department">Department</option><option value="team">Team</option><option value="management">Management</option><option value="project">Project</option></select></div>}
      <input className="input" placeholder="Search active employees" value={peopleQuery} onChange={event => setPeopleQuery(event.target.value)} /><div className="chat-people-list">{people.map(person => { const existing = conversations.some(item => item.chat_conversations.conversation_type === 'personal' && item.chat_conversations.chat_members.some((member: any) => member.profile_id === person.id)); const selected = mode === 'direct' ? selectedPerson?.id === person.id : group.members.includes(person.id); return <button key={person.id} className={selected ? 'selected' : ''} onClick={() => mode === 'direct' ? setSelectedPerson(person) : setGroup(current => ({ ...current, members: current.members.includes(person.id) ? current.members.filter(id => id !== person.id) : [...current.members, person.id] }))}><Avatar name={person.full_name} /><span><b>{person.full_name}</b><small>{person.designation || 'Employee'} - {person.department?.name || 'No department'}</small></span>{mode === 'direct' ? <i>{existing ? 'Existing conversation' : selected ? 'Selected' : 'Select'}</i> : <i>{selected ? 'Selected' : 'Add'}</i>}</button>; })}</div>
      <footer><button className="button button-secondary" onClick={() => setMode('chooser')}>Back</button>{mode === 'direct' ? <button className="btn btn-primary" disabled={!selectedPerson} onClick={() => void create(selectedPerson)}>Start conversation</button> : <button className="btn btn-primary" disabled={!group.title || group.members.length < 2} onClick={() => void create()}>Create group</button>}</footer></>}</section></div>}
  </section>;
}

function chatName(item: any, userId?: string) { const conversation = item.chat_conversations || item; return conversation.conversation_type === 'group' ? conversation.title || 'Untitled group' : (conversation.chat_members || []).filter((member: any) => member.profile_id !== userId).map((member: any) => member.profiles?.full_name).filter(Boolean).join(', ') || 'Direct conversation'; }
function other(item: any, userId: string) { return (item.chat_conversations?.chat_members || []).find((member: any) => member.profile_id !== userId)?.profiles; }
function Avatar({ name, large = false }: { name?: string; large?: boolean }) { return <span className={`chat-avatar ${large ? 'large' : ''}`}>{(name || '?').trim().slice(0, 1).toUpperCase()}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="chat-empty"><span>Chat</span><b>{title}</b><p>{text}</p></div>; }
function Message({ message, own, sender }: { message: any; own: boolean; sender: boolean }) { return <article className={`chat-message ${own ? 'own' : ''}`}>{sender && <b className="chat-sender">{message.sender?.full_name || 'Member'}</b>}<div>{message.body && <p>{message.body}</p>}{message.attachment_name && <MessageFile message={message} />}<time>{time(message.created_at)}{own && ' - Sent'}</time></div></article>; }
function MessageFile({ message }: { message: any }) { const [url, setUrl] = useState(''); useEffect(() => { if (message.attachment_path) void employeeRepository.chatAttachmentUrl(message.attachment_path).then(setUrl).catch(() => undefined); }, [message.attachment_path]); const image = message.attachment_type?.startsWith('image/'); return <a className="chat-attachment" href={url || undefined} target="_blank" rel="noreferrer">{image && url ? <img src={url} alt={message.attachment_name} /> : <span>FILE</span>}<b>{message.attachment_name}</b><small>{size(message.attachment_size)}</small></a>; }
function Member({ member, admin, own, conversationId, refresh, report }: any) { const person = member.profiles || member; return <div className="chat-member"><Avatar name={person.full_name} /><span><b>{person.full_name || 'Member'}{member.profile_id === member.group_admin_id ? ' Admin' : ''}</b><small>{person.designation || person.department?.name || 'Employee'}</small></span>{admin && !own && <button onClick={() => void employeeRepository.manageChatMember(conversationId, member.profile_id, 'remove').then(refresh).catch((cause: any) => report(cause.message))}>Remove</button>}</div>; }
