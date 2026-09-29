"use client";

import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpenText, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { GeniePolicyDocument, GenieSource } from '@/lib/genie-policy';
import './genie-chat.css';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  status?: 'answered' | 'conversation' | 'not_found' | 'error';
  sources?: GenieSource[];
  created?: { type: string; id: string; href: string };
};

const STARTER_QUESTIONS = [
  'What are BSmile working hours?',
  'How many casual leaves do employees receive?',
  'How many interview rounds are there?',
  'What are the standard timings for interns?',
];

const POLICY_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi, I’m Genie. I can answer from approved policies or guide you through creating a lead, task, or expense.',
};

function GenieMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`genie-mark${small ? ' genie-mark-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path d="M16 15.5c0-6.1 3.8-10.1 8-10.1s8 4 8 10.1c0 4.7-2.1 8.1-5.4 9.5v3.2h-5.2V25C18.1 23.6 16 20.2 16 15.5Z" />
        <path d="M18.2 14.2c2.3.8 4.1.2 5.8-1.5 1.8 1.7 3.6 2.3 5.8 1.5" />
        <path d="M20.2 29.5h7.6c0 6.1 2.6 8.5 7.8 9.8-4.5 2.5-8.4 2.7-11.6.4-3.2 2.3-7.1 2.1-11.6-.4 5.2-1.3 7.8-3.7 7.8-9.8Z" />
        <circle cx="21" cy="17.4" r="1" />
        <circle cx="27" cy="17.4" r="1" />
      </svg>
    </span>
  );
}

const pageLabel = (pages: number[]) => pages.length === 1 ? `p. ${pages[0]}` : `pp. ${pages.join('–')}`;

function SourceReferences({ sources }: { sources: GenieSource[] }) {
  return (
    <div className="genie-sources" aria-label="Policy sources">
      <span className="genie-source-heading"><BookOpenText size={14} /> Sources</span>
      {sources.map((source) => (
        <details key={`${source.documentTitle}-${source.section}`}>
          <summary>
            <span>{source.documentTitle} v{source.version}</span>
            <small>§ {source.section} · {pageLabel(source.pages)}</small>
          </summary>
          <blockquote>{source.excerpt}</blockquote>
        </details>
      ))}
    </div>
  );
}

function formatPolicyDate(document: GeniePolicyDocument) {
  const value = document.effectiveDate || document.updatedDate;
  if (!value) return 'Date not specified';
  const label = document.effectiveDate ? 'Effective' : 'Updated';
  return `${label} ${POLICY_DATE_FORMATTER.format(new Date(`${value}T00:00:00Z`))}`;
}

export function GenieChat({ documents }: { documents: GeniePolicyDocument[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const messageCounter = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const isNearThreadEnd = useRef(true);
  const forceThreadEnd = useRef(true);
  const conversationId = useRef(globalThis.crypto?.randomUUID?.() || '');

  useEffect(() => setInteractive(true), []);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (messages.length === 1 && !loading) return;
    if (!thread || (!forceThreadEnd.current && !isNearThreadEnd.current)) return;
    const scrollToLatest = () => {
      thread.scrollTop = thread.scrollHeight;
      forceThreadEnd.current = false;
      isNearThreadEnd.current = true;
    };
    scrollToLatest();
    const frame = window.requestAnimationFrame(scrollToLatest);
    return () => window.cancelAnimationFrame(frame);
  }, [messages, loading]);

  const trackThreadPosition = () => {
    const thread = threadRef.current;
    if (!thread) return;
    isNearThreadEnd.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 96;
  };

  const ask = async (nextQuestion: string) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading) return;
    const userMessage: ChatMessage = { id: `user-${messageCounter.current += 1}`, role: 'user', text: trimmed };
    forceThreadEnd.current = true;
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setLoading(true);
    try {
      const response = await fetch('/api/genie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, conversationId: conversationId.current }),
      });
      const payload = await response.json() as {
        answer?: string;
        error?: string;
        status?: 'answered' | 'conversation' | 'not_found';
        sources?: GenieSource[];
        created?: { type: string; id: string; href: string };
      };
      if (!response.ok) throw new Error(payload.error || 'Genie could not answer right now.');
      setMessages((current) => [...current, {
        id: `assistant-${messageCounter.current += 1}`,
        role: 'assistant',
        text: payload.answer || 'I couldn’t find that in the approved policies.',
        status: payload.status,
        sources: payload.sources || [],
        created: payload.created,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: `assistant-${messageCounter.current += 1}`,
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Genie is temporarily unavailable. Please try again.',
        status: 'error',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void ask(question);
  };

  return (
    <section className="genie-page" aria-labelledby="genie-title">
      <header className="genie-page-header">
        <div className="genie-title-lockup">
          <GenieMark />
          <div>
            <div className="genie-name-line">
              <h1 id="genie-title">Genie</h1>
              <span><ShieldCheck size={13} /> Internal</span>
            </div>
            <p>BSmile’s policy and workflow assistant</p>
          </div>
        </div>
        <div className="genie-scope-pill"><LockKeyhole size={14} /> Permission-aware</div>
      </header>

      <div className="genie-workspace">
        <section className="genie-chat-panel" aria-label="Chat with Genie">
          <div className="genie-thread" ref={threadRef} onScroll={trackThreadPosition} aria-live="polite" aria-busy={loading}>
            {messages.map((message) => (
              <article className={`genie-message genie-message-${message.role}${message.status ? ` is-${message.status}` : ''}`} key={message.id}>
                {message.role === 'assistant' && <GenieMark small />}
                <div className="genie-message-content">
                  <span className="genie-speaker">{message.role === 'assistant' ? 'Genie' : 'You'}</span>
                  <p>{message.text}</p>
                  {message.created && <Link className="mt-2 inline-block text-xs font-bold text-teal-700 underline" href={message.created.href}>Open created {message.created.type}</Link>}
                  {message.sources && message.sources.length > 0 && <SourceReferences sources={message.sources} />}
                </div>
              </article>
            ))}

            {messages.length === 1 && (
              <section className="genie-starters" aria-label="Suggested questions">
                <h2>Try asking</h2>
                <div>
                  {STARTER_QUESTIONS.map((starter) => (
                    <button type="button" key={starter} disabled={!interactive || loading} onClick={() => void ask(starter)}>{starter}</button>
                  ))}
                </div>
              </section>
            )}

            {loading && (
              <div className="genie-typing" role="status">
                <GenieMark small />
                <span><i /><i /><i /></span>
                <em>Checking the approved policies…</em>
              </div>
            )}
          </div>

          <form className="genie-composer" onSubmit={submit}>
            <label htmlFor="genie-question">Ask a policy question or create a record</label>
            <div>
              <textarea
                id="genie-question"
                value={question}
                maxLength={400}
                rows={1}
                placeholder="Ask a policy question or create a lead, task, or expense"
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleComposerKey}
                disabled={!interactive || loading}
              />
              <button type="submit" disabled={!interactive || loading || !question.trim()} aria-label="Ask Genie">
                <Send size={18} />
              </button>
            </div>
            <small>Enter to send · Shift + Enter for a new line</small>
          </form>
        </section>

        <aside className="genie-policy-shelf" aria-label="Approved policy library">
          <div>
            <span className="genie-shelf-kicker">Knowledge scope</span>
            <h2>Approved policy sources</h2>
            <p>Policy answers remain grounded here. Action workflows use only authorized application choices.</p>
          </div>
          <ol>
            {documents.map((document, index) => (
              <li key={document.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <b>{document.title}</b>
                  <small>Version {document.version} · {formatPolicyDate(document)} · {document.pageCount} pages</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="genie-privacy-note">
            <ShieldCheck size={18} />
            <div>
              <b>Private by design</b>
              <p>Actions are permission-checked, reviewed, confirmed, and saved to the normal modules.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
