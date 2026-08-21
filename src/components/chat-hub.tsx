"use client";
/* Switching conversations intentionally clears the previous message state before loading. */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { currentProfile } from "@/lib/auth";
import { employeeRepository } from "@/lib/employee-repository";
import { supabase } from "@/lib/supabase";
import { upsertChatMessage } from "@/lib/chat-message-state";
import { chatEmojiGroups, insertEmojiAtCursor } from "@/lib/chat-composer";
import "./chat-hub-fixes.css";

type Tab = "all" | "unread" | "mentions";

const time = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "";
const size = (value?: number) =>
  !value
    ? ""
    : value < 1024 * 1024
      ? `${Math.ceil(value / 1024)} KB`
      : `${(value / 1024 / 1024).toFixed(1)} MB`;
const durationLabel = (seconds = 0) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const retentionLabel = (seconds = 0) => ({ 0: "Off", 86400: "24 hours", 604800: "7 days", 2592000: "30 days" }[seconds] || "Off");
const dateLabel = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
};
type VoicePreview = { file: File; url: string; duration: number };

export function ChatHub() {
  const [profile, setProfile] = useState<any>();
  const [conversations, setConversations] = useState<any[]>([]);
  const [active, setActive] = useState<any>();
  const [messages, setMessages] = useState<any[]>([]);
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [loadingEarlierMessages, setLoadingEarlierMessages] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState<VoicePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [mode, setMode] = useState<"chooser" | "direct" | "group">("chooser");
  const [selectedPerson, setSelectedPerson] = useState<any>();
  const [people, setPeople] = useState<any[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [mentionProfileIds, setMentionProfileIds] = useState<string[]>([]);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [group, setGroup] = useState({
    title: "",
    description: "",
    type: "general",
    members: [] as string[],
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const textSelectionRef = useRef({ start: 0, end: 0 });
  const emojiRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedRef = useRef(0);
  const messageRequest = useRef(0);
  const profileRef = useRef<any>(undefined);
  const activeRef = useRef<any>(undefined);

  const load = useCallback(async (selectedId?: string) => {
    try {
      const me = profileRef.current || ((await currentProfile()) as any);
      if (!me) throw new Error("Your session has expired.");
      profileRef.current = me;
      setProfile(me);
      const list = await employeeRepository.conversations(me.id);
      setConversations(list);
      const next = selectedId
        ? list.find((item: any) => item.conversation_id === selectedId)
        : list.find(
            (item: any) =>
              item.conversation_id === activeRef.current?.conversation_id,
          ) || list[0];
      activeRef.current = next || null;
      setActive(next || null);
      setError("");
    } catch (cause: any) {
      console.error(cause);
      setError(
        "Chat could not be loaded. Please refresh the page or try again shortly.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const conversationId = active?.conversation_id;
    const profileId = profile?.id;
    if (!conversationId || !profileId) return;
    let alive = true;
    const requestId = ++messageRequest.current;
    setMessages([]);
    setHasEarlierMessages(false);
    setError("");
    const loadMessages = async () => {
      try {
        const page = await employeeRepository.chatMessagePage(
          conversationId,
        );
        if (!alive || requestId !== messageRequest.current) return;
        setMessages(
          page.data.filter(
            (message: any) =>
              message.conversation_id === conversationId,
          ),
        );
        setHasEarlierMessages(page.hasMore);
        await employeeRepository.markConversationRead(
          conversationId,
          profileId,
          page.data.at(-1)?.id,
        );
        setConversations((list) =>
          list.map((item) =>
            item.conversation_id === conversationId
              ? { ...item, unread_count: 0 }
              : item,
          ),
        );
        setTimeout(
          () =>
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
            }),
          20,
        );
      } catch (cause: any) {
        if (alive && requestId === messageRequest.current)
          setError(cause.message);
      }
    };
    void loadMessages();
    const channel = supabase
      ?.channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (event: any) => {
          setMessages((rows) => upsertChatMessage(rows, event.new as any));
          if (event.new.sender_id !== profileId)
            void employeeRepository.markConversationRead(
              conversationId,
              profileId,
            );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (event: any) => {
          setMessages((rows) => upsertChatMessage(rows, event.new as any));
        },
      )
      .subscribe();
    return () => {
      alive = false;
      if (channel) supabase?.removeChannel(channel);
    };
  }, [active?.conversation_id, profile?.id]);
  useEffect(() => {
    const profileId = profile?.id;
    if (!newChat || !profileId) return;
    const timer = setTimeout(() => {
      void employeeRepository
        .chatPeople(peopleQuery)
        .then((rows) =>
          setPeople(rows.filter((person: any) => person.id !== profileId)),
        )
        .catch((cause) => setError(cause.message));
    }, 180);
    return () => clearTimeout(timer);
  }, [newChat, peopleQuery, profile?.id]);
  useEffect(() => {
    if (!emojiOpen) return;
    const close = (event: PointerEvent) => {
      if (!emojiRef.current?.contains(event.target as Node))
        setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [emojiOpen]);
  useEffect(
    () => () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (voicePreview) URL.revokeObjectURL(voicePreview.url);
    },
    [voicePreview],
  );

  const visible = useMemo(
    () =>
      conversations.filter((item) => {
        const name = chatName(item, profile?.id).toLowerCase();
        const preview =
          `${item.latest_message?.body || ""} ${item.latest_message?.message_type === "voice" ? "Voice message" : item.latest_message?.attachment_name || ""}`.toLowerCase();
        return (
          (tab === "all" ||
            (tab === "unread" && item.unread_count > 0) ||
            (tab === "mentions" && item.mention_count > 0)) &&
          `${name} ${preview}`.includes(query.toLowerCase())
        );
      }),
    [conversations, tab, query, profile?.id],
  );
  const matchingMessages = useMemo(
    () =>
      !messageQuery
        ? messages
        : messages.filter((message) =>
            `${message.body || ""} ${message.attachment_name || ""} ${message.sender?.full_name || ""}`
              .toLowerCase()
              .includes(messageQuery.toLowerCase()),
          ),
    [messages, messageQuery],
  );
  const mentionMatch = text.match(/(?:^|\s)@([^\s@]*)$/);
  const mentionTerm = mentionMatch?.[1].toLowerCase() || "";
  const mentionCandidates = (active?.chat_conversations?.chat_members || [])
    .filter((member: any) => member.profile_id !== profile?.id)
    .filter((member: any) => (member.profiles?.full_name || "").toLowerCase().includes(mentionTerm))
    .slice(0, 6);
  const chooseMention = (member: any) => {
    const name = member.profiles?.full_name || "Member";
    const index = text.lastIndexOf("@");
    setText(`${text.slice(0, index)}@${name} ${text.slice(index + 1 + mentionTerm.length)}`);
    setMentionProfileIds((ids) => ids.includes(member.profile_id) ? ids : [...ids, member.profile_id]);
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (
      !active ||
      !profile ||
      sending ||
      (!text.trim() && !file && !voicePreview)
    )
      return;
    if (editingMessage) {
      if (!text.trim()) return;
      setSending(true);
      setError("");
      try {
        const saved = await employeeRepository.editChatMessage(editingMessage.id, text, mentionProfileIds);
        setMessages((rows) => upsertChatMessage(rows, saved));
        setText("");
        setEditingMessage(null);
        setMentionProfileIds([]);
      } catch (cause: any) {
        setError(cause.message || "Message could not be edited. Please try again.");
      } finally {
        setSending(false);
      }
      return;
    }
    const channelId = active.chat_conversations?.channel_id;
    if (!channelId) {
      setError(
        "Message could not be sent because the conversation was not ready. Please reopen the chat and try again.",
      );
      return;
    }
    const clientMessageId = crypto.randomUUID();
    const pending = {
      id: `pending-${clientMessageId}`,
      client_message_id: clientMessageId,
      sender_id: profile.id,
      body: text.trim(),
      created_at: new Date().toISOString(),
      attachment_name: file?.name,
      attachment_size: file?.size || voicePreview?.file.size,
      attachment_path: voicePreview ? voicePreview.url : undefined,
      attachment_type: voicePreview?.file.type,
      message_type: voicePreview ? "voice" : file ? "attachment" : "text",
      voice_duration_seconds: voicePreview?.duration,
      reply_to_message_id: replyingTo?.id || null,
      mention_profile_ids: mentionProfileIds,
      status: "sending",
    };
    setSending(true);
    setError("");
    setMessages((rows) => [...rows, pending]);
    const draftText = text;
    const draftFile = file;
    const draftVoice = voicePreview;
    try {
      const saved = await employeeRepository.sendMessage({
        conversation_id: active.conversation_id,
        channel_id: channelId,
        sender_id: profile.id,
        body: pending.body,
        client_message_id: clientMessageId,
        file: draftVoice?.file || draftFile,
        voice_duration_seconds: draftVoice?.duration,
        reply_to_message_id: replyingTo?.id || null,
        mention_profile_ids: mentionProfileIds,
      });
      setMessages((rows) => upsertChatMessage(rows, saved));
      setText("");
      setFile(null);
      setReplyingTo(null);
      setMentionProfileIds([]);
      if (draftVoice) URL.revokeObjectURL(draftVoice.url);
      setVoicePreview(null);
    } catch (cause: any) {
      setMessages((rows) =>
        rows.map((row) =>
          row.id === pending.id ? { ...row, status: "failed" } : row,
        ),
      );
      setError(cause.message || "Message could not be sent. Please try again.");
      console.error(cause);
    } finally {
      setSending(false);
    }
  };
  const loadEarlierMessages = async () => {
    if (!active || loadingEarlierMessages || !messages.length) return;
    setLoadingEarlierMessages(true);
    const container = scrollRef.current;
    const previousHeight = container?.scrollHeight || 0;
    try {
      const page = await employeeRepository.chatMessagePage(
        active.conversation_id,
        messages[0]?.created_at,
      );
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        return [...page.data.filter((message: any) => !known.has(message.id)), ...current];
      });
      setHasEarlierMessages(page.hasMore);
      requestAnimationFrame(() => {
        if (container) container.scrollTop += container.scrollHeight - previousHeight;
      });
    } catch (cause: any) {
      setError(cause.message || "Earlier messages could not be loaded.");
    } finally {
      setLoadingEarlierMessages(false);
    }
  };
  const insertEmoji = (emoji: string) => {
    const input = textRef.current;
    const selection = textSelectionRef.current;
    const inserted = insertEmojiAtCursor(
      text,
      emoji,
      selection.start,
      selection.end,
    );
    textSelectionRef.current = {
      start: inserted.cursor,
      end: inserted.cursor,
    };
    setText(inserted.value);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  };
  const releaseRecorder = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  };
  const startRecording = async () => {
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Voice recording is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        preferred ? { mimeType: preferred } : undefined,
      );
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      setRecording(true);
      setEmojiOpen(false);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        releaseRecorder();
        setError("Recording was interrupted. Please try again.");
      };
      recorder.onstop = () => {
        const duration = Math.max(
          1,
          Math.round((Date.now() - recordingStartedRef.current) / 1000),
        );
        const mimeType =
          recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        releaseRecorder();
        if (!blob.size) {
          setError(
            "No audio was captured. Check your microphone and try again.",
          );
          return;
        }
        if (voicePreview) URL.revokeObjectURL(voicePreview.url);
        const extension = mimeType.includes("ogg") ? "ogg" : "webm";
        const voiceFile = new File([blob], `voice-${Date.now()}.${extension}`, {
          type: mimeType,
        });
        setVoicePreview({
          file: voiceFile,
          url: URL.createObjectURL(blob),
          duration,
        });
      };
      recorder.start(250);
      recordingTimerRef.current = setInterval(
        () =>
          setRecordingSeconds(
            Math.floor((Date.now() - recordingStartedRef.current) / 1000),
          ),
        1000,
      );
    } catch (cause: any) {
      releaseRecorder();
      setError(
        cause?.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access in your browser and try again."
          : cause?.name === "NotFoundError"
            ? "No microphone was found on this device."
            : "The microphone could not be started. Please try again.",
      );
    }
  };
  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };
  const discardVoice = () => {
    if (voicePreview) URL.revokeObjectURL(voicePreview.url);
    setVoicePreview(null);
  };
  const submitKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };
  const create = async (person?: any) => {
    try {
      const id =
        mode === "direct"
          ? await employeeRepository.createPersonalChat(profile.id, person.id)
          : await employeeRepository.createGroupChat(
              profile.id,
              group.title,
              group.members,
              group.description,
              group.type,
            );
      setNewChat(false);
      setSelectedPerson(undefined);
      setGroup({ title: "", description: "", type: "general", members: [] });
      await load(id);
    } catch (cause: any) {
      setError("Chat could not be created. Please try again shortly.");
      console.error(cause);
    }
  };
  const switchConversation = (item: any) => {
    messageRequest.current++;
    setMessages([]);
    setError("");
    activeRef.current = item;
    setActive(item);
    setDetails(false);
    setMessageQuery("");
    setReplyingTo(null);
    setEditingMessage(null);
    setMentionProfileIds([]);
  };
  const resizeComposer = (element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  };
  const react = async (messageId: string, emoji: string) => { try { await employeeRepository.toggleChatReaction(messageId, emoji); setReactionTarget(null); if (active) { const page = await employeeRepository.chatMessagePage(active.conversation_id); setMessages(page.data); } } catch { setError('Reaction could not be saved. Please try again.'); } };
  const beginReply = (message: any) => {
    setEditingMessage(null);
    setReplyingTo(message);
    setActionTarget(null);
    requestAnimationFrame(() => textRef.current?.focus());
  };
  const beginEdit = (message: any) => {
    setReplyingTo(null);
    setFile(null);
    discardVoice();
    setEditingMessage(message);
    setText(message.body || "");
    setMentionProfileIds((message.mentions || []).map((mention: any) => mention.profile_id));
    setActionTarget(null);
    requestAnimationFrame(() => {
      if (textRef.current) {
        resizeComposer(textRef.current);
        textRef.current.focus();
      }
    });
  };
  const deleteMessage = async (messageId: string) => {
    try {
      const saved = await employeeRepository.deleteChatMessage(messageId);
      setMessages((rows) => upsertChatMessage(rows, saved));
      setActionTarget(null);
    } catch (cause: any) {
      setError(cause.message || "Message could not be deleted. Please try again.");
    }
  };
  const changeRetention = async (seconds: number) => {
    if (!active || retentionSaving) return;
    setRetentionSaving(true);
    try {
      await employeeRepository.setChatDisappearingMessages(active.conversation_id, seconds);
      setActive((current: any) => ({ ...current, chat_conversations: { ...current.chat_conversations, disappearing_message_seconds: seconds } }));
      setConversations((rows) => rows.map((item) => item.conversation_id === active.conversation_id ? { ...item, chat_conversations: { ...item.chat_conversations, disappearing_message_seconds: seconds } } : item));
    } catch (cause: any) { setError(cause.message || "Disappearing message setting could not be updated."); }
    finally { setRetentionSaving(false); }
  };
  if (loading)
    return (
      <div className="chat-skeleton">
        <div />
        <div />
      </div>
    );
  if (!profile)
    return (
      <section className="chat-state">
        <h1>Internal Chat</h1>
        <p>{error || "Sign in to use chat."}</p>
      </section>
    );
  const isGroup = active?.chat_conversations?.conversation_type === "group";
  const isAdmin = active?.chat_conversations?.group_admin_id === profile.id;
  const members = active?.chat_conversations?.chat_members || [];

  return (
    <section className={`chat-hub ${active ? "chat-open" : ""}`}>
      <header className="employee-page-header chat-page-header">
        <div>
          <p className="eyebrow">COMMUNICATION</p>
          <h1>Internal Chat</h1>
          <p>
            Private conversations and team communication for active employees.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setMode("chooser");
            setSelectedPerson(undefined);
            setNewChat(true);
          }}
        >
          + New conversation
        </button>
      </header>
      {error && <p className="employee-banner dashboard-error">{error}</p>}
      <div className="chat-layout">
        <aside className="chat-conversation-panel">
          <div className="chat-panel-top">
            <div>
              <h2>Messages</h2>
              <small>
                {conversations.reduce(
                  (total, item) => total + (item.unread_count || 0),
                  0,
                )}{" "}
                unread
              </small>
            </div>
            <button
              onClick={() => {
                setMode("chooser");
                setSelectedPerson(undefined);
                setNewChat(true);
              }}
              aria-label="New conversation"
            >
              +
            </button>
          </div>
          <input
            className="input chat-search"
            placeholder="Search conversations..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="chat-tabs">
            {(["all", "unread", "mentions"] as Tab[]).map((value) => (
              <button
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
                key={value}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <div className="chat-conversation-list">
            {visible.map((item, index) => {
              const groupItem =
                item.chat_conversations.conversation_type === "group";
              const previousGroup =
                index > 0 &&
                visible[index - 1].chat_conversations.conversation_type ===
                  "group";
              return (
                <div
                  className="chat-conversation-row"
                  key={item.conversation_id}
                >
                  {(index === 0 || groupItem !== previousGroup) && (
                    <p className="chat-list-section">
                      {groupItem ? "Groups" : "Direct Messages"}
                    </p>
                  )}
                  <button
                    className={`chat-conversation ${item.chat_conversations.is_system_group ? "system" : ""} ${active?.conversation_id === item.conversation_id ? "active" : ""}`}
                    onClick={() => switchConversation(item)}
                  >
                    {item.chat_conversations.is_system_group ? (
                      <span
                        className="chat-avatar chat-group-avatar"
                        aria-hidden="true"
                      >
                        👥
                      </span>
                    ) : (
                      <Avatar name={chatName(item, profile.id)} />
                    )}
                    <div>
                      <b>{chatName(item, profile.id)}</b>
                      <small>{messagePreview(item.latest_message)}</small>
                    </div>
                    <aside>
                      <time>{time(item.latest_message?.created_at)}</time>
                      {item.unread_count > 0 && (
                        <span>
                          {item.unread_count > 99 ? "99+" : item.unread_count}
                        </span>
                      )}
                    </aside>
                  </button>
                </div>
              );
            })}
            {!visible.length && (
              <Empty
                title={
                  query ? "No matching conversations" : "No conversations yet"
                }
                text={
                  query
                    ? "Try another search."
                    : "Start a direct message or create a group."
                }
              />
            )}
          </div>
        </aside>
        <main className="chat-message-panel">
          {active ? (
            <>
              <header className="chat-message-header">
                <button className="chat-back" onClick={() => { activeRef.current = null; setActive(null); }}>
                  Back
                </button>
                {active.chat_conversations.is_system_group ? (
                  <span
                    className="chat-avatar chat-group-avatar"
                    aria-hidden="true"
                  >
                    👥
                  </span>
                ) : (
                  <Avatar name={chatName(active, profile.id)} />
                )}
                <div>
                  <h2>{chatName(active, profile.id)}</h2>
                  <small>
                    {isGroup
                      ? `${members.length} members - ${active.chat_conversations.group_type || "group"}`
                      : other(active, profile.id)?.designation ||
                        "Direct conversation"}
                  </small>
                </div>
                <div className="chat-header-actions">
                  <button
                    aria-label="Search messages"
                    title="Search messages"
                    onClick={() =>
                      setMessageQuery((value) => (value ? "" : " "))
                    }
                  >
                    <span aria-hidden="true">⌕</span>
                  </button>
                  <button
                    aria-label="Conversation details"
                    title="Conversation details"
                    onClick={() => setDetails((value) => !value)}
                  >
                    <span aria-hidden="true">i</span>
                  </button>
                  <button
                    className="chat-more-button"
                    aria-label="More conversation options"
                    title="More conversation options"
                    onClick={() => setDetails((value) => !value)}
                  >
                    <span aria-hidden="true">•••</span>
                  </button>
                </div>
              </header>
              {messageQuery !== "" && (
                <div className="chat-message-search">
                  <input
                    className="input"
                    autoFocus
                    placeholder="Search messages, people, or files"
                    value={messageQuery === " " ? "" : messageQuery}
                    onChange={(event) => setMessageQuery(event.target.value)}
                  />
                  <button onClick={() => setMessageQuery("")}>Close</button>
                </div>
              )}
              <div className="chat-messages" ref={scrollRef}>
                {hasEarlierMessages && !messageQuery.trim() && (
                  <button
                    type="button"
                    className="chat-load-earlier"
                    disabled={loadingEarlierMessages}
                    onClick={() => void loadEarlierMessages()}
                  >
                    {loadingEarlierMessages ? "Loading..." : "Load earlier messages"}
                  </button>
                )}
                {matchingMessages.map((message, index) => {
                  const previous = matchingMessages[index - 1];
                  const showDate = !previous ||
                    new Date(previous.created_at).toDateString() !==
                      new Date(message.created_at).toDateString();
                  const showSender = isGroup && message.sender_id !== profile.id &&
                    (!previous || previous.sender_id !== message.sender_id ||
                      new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() > 300000);
                  return (
                    <div className="chat-message-group" key={message.id}>
                      {showDate && <div className="chat-date-divider"><span>{dateLabel(message.created_at)}</span></div>}
                      <Message
                        message={message}
                        own={message.sender_id === profile.id}
                        sender={showSender}
                        reactionOpen={reactionTarget === message.id}
                        onReactionOpen={() => setReactionTarget(reactionTarget === message.id ? null : message.id)}
                        onReact={(emoji) => void react(message.id, emoji)}
                        actionOpen={actionTarget === message.id}
                        onActionOpen={() => setActionTarget(actionTarget === message.id ? null : message.id)}
                        onReply={() => beginReply(message)}
                        onEdit={() => beginEdit(message)}
                        onDelete={() => void deleteMessage(message.id)}
                        read={Boolean(!isGroup && message.sender_id === profile.id && members.find((member: any) => member.profile_id !== profile.id)?.last_read_at && new Date(members.find((member: any) => member.profile_id !== profile.id).last_read_at) >= new Date(message.created_at))}
                      />
                    </div>
                  );
                })}
                {!messages.length && (
                  <Empty
                    title="No messages yet"
                    text="Send the first message to start this conversation."
                  />
                )}
                {!!messageQuery && !matchingMessages.length && (
                  <Empty
                    title="No messages found"
                    text="Search message text, senders, or attachment names."
                  />
                )}
              </div>
              <form
                className={`chat-composer ${recording || voicePreview ? "voice-active" : ""}`}
                onSubmit={send}
              >
                {(replyingTo || editingMessage) && (
                  <div className="chat-compose-context">
                    <span>
                      <b>{editingMessage ? "Editing message" : `Replying to ${replyingTo?.sender?.full_name || "member"}`}</b>
                      <small>{messageSnippet(editingMessage || replyingTo)}</small>
                    </span>
                    <button type="button" aria-label="Cancel message action" onClick={() => { setReplyingTo(null); setEditingMessage(null); setMentionProfileIds([]); setText(""); }}>×</button>
                  </div>
                )}
                {file && (
                  <span className="chat-file-chip">
                    {file.name}
                    <button type="button" onClick={() => setFile(null)}>
                      x
                    </button>
                  </span>
                )}
                {!active.chat_conversations?.channel_id && (
                  <small className="chat-composer-warning">
                    Conversation is preparing. Reopen this chat before sending a
                    message.
                  </small>
                )}
                {recording ? (
                  <div className="chat-recording">
                    <span>
                      <i />
                      Recording · {durationLabel(recordingSeconds)}
                    </span>
                    <button
                      type="button"
                      className="btn border"
                      onClick={stopRecording}
                    >
                      Stop
                    </button>
                  </div>
                ) : voicePreview ? (
                  <div className="chat-voice-preview">
                    <audio src={voicePreview.url} controls preload="metadata" />
                    <span>{durationLabel(voicePreview.duration)}</span>
                    <button type="button" onClick={discardVoice}>
                      Delete
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="chat-emoji-wrap" ref={emojiRef}>
                      <button
                        type="button"
                        className="chat-emoji-button"
                        aria-label="Choose emoji"
                        aria-expanded={emojiOpen}
                        onClick={() => setEmojiOpen((value) => !value)}
                        disabled={sending}
                      >
                        <span aria-hidden="true">☺</span>
                      </button>
                      {emojiOpen && (
                        <div
                          className="chat-emoji-picker"
                          role="dialog"
                          aria-label="Emoji picker"
                        >
                          {chatEmojiGroups.map((emojiGroup) => (
                            <section key={emojiGroup.label}>
                              <b>{emojiGroup.label}</b>
                              <div>
                                {emojiGroup.emojis.map((emoji) => (
                                  <button
                                    type="button"
                                    key={emoji}
                                    aria-label={`Insert ${emoji}`}
                                    onClick={() => insertEmoji(emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </div>
                    <textarea
                      ref={textRef}
                      className="input"
                      rows={1}
                      placeholder={editingMessage ? "Edit message" : "Type a message"}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        resizeComposer(event.currentTarget);
                        textSelectionRef.current = {
                          start: event.target.selectionStart,
                          end: event.target.selectionEnd,
                        };
                      }}
                      onSelect={(event) => {
                        textSelectionRef.current = {
                          start: event.currentTarget.selectionStart,
                          end: event.currentTarget.selectionEnd,
                        };
                      }}
                      onKeyDown={submitKey}
                      onInput={(event) => resizeComposer(event.currentTarget)}
                      disabled={
                        sending || !active.chat_conversations?.channel_id
                      }
                    />
                    {mentionMatch && mentionCandidates.length > 0 && (
                      <div className="chat-mention-picker" role="listbox" aria-label="Mention a participant">
                        {mentionCandidates.map((member: any) => (
                          <button type="button" role="option" key={member.profile_id} onClick={() => chooseMention(member)}>
                            <Avatar name={member.profiles?.full_name} />
                            <span><b>{member.profiles?.full_name}</b><small>{member.profiles?.designation || "Participant"}</small></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className="chat-attach"
                  onClick={() => fileRef.current?.click()}
                  disabled={
                    sending ||
                    recording ||
                    !!voicePreview ||
                    !active.chat_conversations?.channel_id
                  }
                >
                  <span aria-hidden="true">⌇</span>
                  <span className="chat-action-label">Attach</span>
                </button>
                {!recording && !voicePreview && (
                  <button
                    type="button"
                    className="chat-mic"
                    aria-label="Record voice message"
                    onClick={() => void startRecording()}
                    disabled={
                      sending ||
                      !!file ||
                      !active.chat_conversations?.channel_id
                    }
                  >
                    <span aria-hidden="true">♩</span>
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  disabled={
                    sending ||
                    !active.chat_conversations?.channel_id ||
                    recording ||
                    (!text.trim() && !file && !voicePreview)
                  }
                >
                  <span aria-hidden="true">➤</span> {sending ? "Sending..." : "Send"}
                </button>
                <small>
                  {voicePreview
                    ? "Preview your voice message before sending."
                    : "Images, PDF, Word, Excel, or voice up to 10 MB"}
                </small>
              </form>
            </>
          ) : (
            <Empty
              title="Choose a conversation"
              text="Select a conversation from the list, or start a new chat."
            />
          )}
        </main>
        {active && details && (
          <aside className="chat-details-panel">
            <div className="chat-details-heading">
              <h2>Conversation details</h2>
              <button aria-label="Close conversation details" onClick={() => setDetails(false)}>Close</button>
            </div>
            <Avatar name={chatName(active, profile.id)} large />
            <h3>{chatName(active, profile.id)}</h3>
            {isGroup ? (
              <>
                <p>
                  {active.chat_conversations.description ||
                    "No group description."}
                </p>
                <div className="chat-detail-section">
                  <div>
                    <b>Members</b>
                    {isAdmin && !active.chat_conversations.is_system_group && (
                      <button
                        onClick={() => {
                          setMode("group");
                          setNewChat(true);
                        }}
                      >
                        Add member
                      </button>
                    )}
                  </div>
                  {members.map((member: any) => (
                    <Member
                      key={member.profile_id}
                      member={member}
                      admin={isAdmin}
                      own={member.profile_id === profile.id}
                      conversationId={active.conversation_id}
                      refresh={() => load(active.conversation_id)}
                      report={setError}
                    />
                  ))}
                </div>
                {!active.chat_conversations.is_system_group && (
                  <button
                    className="chat-leave"
                    onClick={() =>
                      void employeeRepository
                        .manageChatMember(
                          active.conversation_id,
                          profile.id,
                          "remove",
                        )
                        .then(() => load())
                        .catch((cause) => setError(cause.message))
                    }
                  >
                    Leave group
                  </button>
                )}
              </>
            ) : (
              <>
                <p>
                  {other(active, profile.id)?.designation || "Employee"} -{" "}
                  {other(active, profile.id)?.department?.name ||
                    "No department"}
                </p>
              </>
            )}
            <div className="chat-detail-section">
              <b>Shared files</b>
              {messages.filter((message) => message.attachment_name && !message.expired_at && !message.deleted_at).slice(-6).map((message) => (
                <MessageFile key={message.id} message={message} />
              ))}
              {!messages.some((message) => message.attachment_name && !message.expired_at && !message.deleted_at) && <small>No files shared yet.</small>}
            </div>
            <div className="chat-detail-section">
              <b>Disappearing messages</b>
              {(!isGroup || isAdmin) ? <select className="input" value={active.chat_conversations.disappearing_message_seconds || 0} disabled={retentionSaving} onChange={(event) => void changeRetention(Number(event.target.value))}>
                <option value={0}>Off</option><option value={86400}>24 hours</option><option value={604800}>7 days</option><option value={2592000}>30 days</option>
              </select> : <small>{retentionLabel(active.chat_conversations.disappearing_message_seconds || 0)}</small>}
            </div>
          </aside>
        )}
      </div>
      {newChat && (
        <div className="chat-modal-backdrop">
          <section className="chat-modal">
            {mode === "chooser" ? (
              <>
                <header>
                  <div>
                    <h2>Start a conversation</h2>
                    <p>Choose how you would like to communicate.</p>
                  </div>
                  <button onClick={() => setNewChat(false)}>Close</button>
                </header>
                <div className="chat-choice-grid">
                  <button onClick={() => setMode("direct")}>
                    <span>DM</span>
                    <b>Direct message</b>
                    <small>Chat privately with one employee</small>
                  </button>
                  <button onClick={() => setMode("group")}>
                    <span>GR</span>
                    <b>New group</b>
                    <small>Create a team or department conversation</small>
                  </button>
                </div>
              </>
            ) : (
              <>
                <header>
                  <div>
                    <h2>
                      {mode === "direct" ? "New direct message" : "New group"}
                    </h2>
                    <p>
                      {mode === "direct"
                        ? "Choose an active employee to start a private conversation."
                        : "Add at least two active employees to your group."}
                    </p>
                  </div>
                  <button onClick={() => setNewChat(false)}>Close</button>
                </header>
                {mode === "group" && (
                  <div className="chat-group-fields">
                    <input
                      className="input"
                      placeholder="Group name *"
                      value={group.title}
                      onChange={(event) =>
                        setGroup({ ...group, title: event.target.value })
                      }
                    />
                    <input
                      className="input"
                      placeholder="Description (optional)"
                      value={group.description}
                      onChange={(event) =>
                        setGroup({ ...group, description: event.target.value })
                      }
                    />
                    <select
                      className="input"
                      value={group.type}
                      onChange={(event) =>
                        setGroup({ ...group, type: event.target.value })
                      }
                    >
                      <option value="general">General</option>
                      <option value="department">Department</option>
                      <option value="team">Team</option>
                      <option value="management">Management</option>
                      <option value="project">Project</option>
                    </select>
                  </div>
                )}
                <input
                  className="input"
                  placeholder="Search active employees"
                  value={peopleQuery}
                  onChange={(event) => setPeopleQuery(event.target.value)}
                />
                <div className="chat-people-list">
                  {people.map((person) => {
                    const existing = conversations.some(
                      (item) =>
                        item.chat_conversations.conversation_type ===
                          "personal" &&
                        item.chat_conversations.chat_members.some(
                          (member: any) => member.profile_id === person.id,
                        ),
                    );
                    const selected =
                      mode === "direct"
                        ? selectedPerson?.id === person.id
                        : group.members.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        className={selected ? "selected" : ""}
                        onClick={() =>
                          mode === "direct"
                            ? setSelectedPerson(person)
                            : setGroup((current) => ({
                                ...current,
                                members: current.members.includes(person.id)
                                  ? current.members.filter(
                                      (id) => id !== person.id,
                                    )
                                  : [...current.members, person.id],
                              }))
                        }
                      >
                        <Avatar name={person.full_name} />
                        <span>
                          <b>{person.full_name}</b>
                          <small>
                            {person.designation || "Employee"} -{" "}
                            {person.department?.name || "No department"}
                          </small>
                        </span>
                        {mode === "direct" ? (
                          <i>
                            {existing
                              ? "Existing conversation"
                              : selected
                                ? "Selected"
                                : "Select"}
                          </i>
                        ) : (
                          <i>{selected ? "Selected" : "Add"}</i>
                        )}
                      </button>
                    );
                  })}
                </div>
                <footer>
                  <button
                    className="button button-secondary"
                    onClick={() => setMode("chooser")}
                  >
                    Back
                  </button>
                  {mode === "direct" ? (
                    <button
                      className="btn btn-primary"
                      disabled={!selectedPerson}
                      onClick={() => void create(selectedPerson)}
                    >
                      Start conversation
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={!group.title || group.members.length < 2}
                      onClick={() => void create()}
                    >
                      Create group
                    </button>
                  )}
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function chatName(item: any, userId?: string) {
  const conversation = item.chat_conversations || item;
  return conversation.conversation_type === "group"
    ? conversation.title || "Untitled group"
    : (conversation.chat_members || [])
        .filter((member: any) => member.profile_id !== userId)
        .map((member: any) => member.profiles?.full_name)
        .filter(Boolean)
        .join(", ") || "Direct conversation";
}
function messagePreview(message: any) {
  if (!message) return "No messages yet";
  if (message.message_type === "voice")
    return `Voice message · ${durationLabel(message.voice_duration_seconds)}`;
  return message.body || message.attachment_name || "No messages yet";
}
function messageSnippet(message: any) {
  if (!message) return "";
  if (message.expired_at) return "Original message expired";
  if (message.deleted_at) return "Original message deleted";
  if (message.message_type === "voice") return "Voice message";
  if (message.attachment_name) return `File: ${message.attachment_name}`;
  return (message.body || "Message").replace(/\s+/g, " ").slice(0, 120);
}
function renderMentionText(message: any) {
  const names = (message.mentions || []).map((mention: any) => mention.profiles?.full_name).filter(Boolean);
  if (!names.length) return message.body;
  const parts = message.body.split(new RegExp(`(@(?:${names.map((name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g"));
  return parts.map((part: string, index: number) => names.includes(part.slice(1)) ? <mark className="chat-mention" key={index}>{part}</mark> : part);
}
function other(item: any, userId: string) {
  return (item.chat_conversations?.chat_members || []).find(
    (member: any) => member.profile_id !== userId,
  )?.profiles;
}
function Avatar({ name, large = false }: { name?: string; large?: boolean }) {
  return (
    <span className={`chat-avatar ${large ? "large" : ""}`}>
      {(name || "?").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="chat-empty">
      <span>Chat</span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
function Message({
  message,
  own,
  sender,
  reactionOpen,
  onReactionOpen,
  onReact,
  actionOpen,
  onActionOpen,
  onReply,
  onEdit,
  onDelete,
  read,
}: {
  message: any;
  own: boolean;
  sender: boolean;
  reactionOpen: boolean;
  onReactionOpen: () => void;
  onReact: (emoji: string) => void;
  actionOpen: boolean;
  onActionOpen: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  read: boolean;
}) {
  return (
    <article id={`chat-message-${message.id}`} className={`chat-message ${own ? "own" : ""} ${(message.deleted_at || message.expired_at) ? "deleted" : ""}`}>
      {sender && <b className="chat-sender">{message.sender?.full_name || "Member"}</b>}
      <div>
        {message.reply_to_message_id && (
          <button
            type="button"
            className="chat-reply-quote"
            onClick={() => document.getElementById(`chat-message-${message.reply_to_message_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            <b>{message.reply_to?.expired_at ? "Original message expired" : message.reply_to?.deleted_at ? "Original message deleted" : message.reply_to?.sender?.full_name || "Original message"}</b>
            <span>{messageSnippet(message.reply_to)}</span>
          </button>
        )}
        {(message.deleted_at || message.expired_at) ? <p className="chat-deleted-copy">{message.expired_at ? "This message expired" : "This message was deleted"}</p> : message.body && <p>{renderMentionText(message)}</p>}
        {!message.deleted_at && !message.expired_at && message.message_type === "voice" ? (
          <VoiceMessage message={message} />
        ) : (
          !message.deleted_at && !message.expired_at && message.attachment_name && <MessageFile message={message} />
        )}
        <time>
          {time(message.created_at)}
          {message.edited_at && !message.deleted_at && " · Edited"}
          {own && (read ? "  Read" : "  Sent")}
        </time>
        {message.message_type !== "system" && <button className="chat-reaction-button" type="button" aria-label="React to message" title="React to message" onClick={onReactionOpen}>☺</button>}
        {message.message_type !== "system" && reactionOpen && <div className="chat-reaction-picker" role="dialog" aria-label="Choose reaction">{['👍','❤️','😂','😮','😢','🎉'].map(emoji => <button type="button" key={emoji} onClick={() => onReact(emoji)}>{emoji}</button>)}</div>}
        {!message.deleted_at && message.message_type !== "system" && <button className="chat-message-more" type="button" aria-label="Message actions" onClick={onActionOpen}>•••</button>}
        {actionOpen && <div className="chat-message-actions" role="menu">
          <button type="button" onClick={onReply}>Reply</button>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(message.body || "")}>Copy</button>
          {own && message.message_type === "text" && <button type="button" onClick={onEdit}>Edit</button>}
          {own && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
        </div>}
        {message.reactions?.length ? <div className="chat-reactions">{Object.entries(message.reactions.reduce((all: any, reaction: any) => ({ ...all, [reaction.emoji]: (all[reaction.emoji] || 0) + 1 }), {})).map(([emoji, count]) => <span key={emoji}>{emoji} {String(count)}</span>)}</div> : null}
      </div>
    </article>
  );
}
function VoiceMessage({ message }: { message: any }) {
  const [url, setUrl] = useState(
    message.attachment_path?.startsWith("blob:") ? message.attachment_path : "",
  );
  useEffect(() => {
    if (message.attachment_path && !message.attachment_path.startsWith("blob:"))
      void employeeRepository
        .chatAttachmentUrl(message.attachment_path)
        .then(setUrl)
        .catch(() => undefined);
  }, [message.attachment_path]);
  return (
    <div className="chat-voice-message">
      <span aria-hidden="true">🎤</span>
      <audio src={url || undefined} controls preload="metadata" />
      <b>{durationLabel(message.voice_duration_seconds)}</b>
    </div>
  );
}
function MessageFile({ message }: { message: any }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (message.attachment_path)
      void employeeRepository
        .chatAttachmentUrl(message.attachment_path)
        .then(setUrl)
        .catch(() => undefined);
  }, [message.attachment_path]);
  const image = message.attachment_type?.startsWith("image/");
  return (
    <a
      className="chat-attachment"
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
    >
      {image && url ? (
        // Signed, user-uploaded chat attachments are intentionally rendered directly.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={message.attachment_name} />
      ) : (
        <span>FILE</span>
      )}
      <b>{message.attachment_name}</b>
      <small>{size(message.attachment_size)}</small>
    </a>
  );
}
function Member({ member, admin, own, conversationId, refresh, report }: any) {
  const person = member.profiles || member;
  return (
    <div className="chat-member">
      <Avatar name={person.full_name} />
      <span>
        <b>
          {person.full_name || "Member"}
          {member.profile_id === member.group_admin_id ? " Admin" : ""}
        </b>
        <small>
          {person.designation || person.department?.name || "Employee"}
        </small>
      </span>
      {admin && !own && (
        <button
          onClick={() =>
            void employeeRepository
              .manageChatMember(conversationId, member.profile_id, "remove")
              .then(refresh)
              .catch((cause: any) => report(cause.message))
          }
        >
          Remove
        </button>
      )}
    </div>
  );
}
