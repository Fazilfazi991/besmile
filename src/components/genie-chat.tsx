"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { BookOpenText, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import type { GeniePolicyDocument, GenieSource } from '@/lib/genie-policy';
import './genie-chat.css';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  status?: 'answered' | 'not_found' | 'error';
  sources?: GenieSource[];
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
  text: 'Hi, I’m Genie. Ask me about the Employee Handbook, Hiring & Recruitment Policy, or Internship Policy. I’ll answer only from those approved documents.',
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

  useEffect(() => setInteractive(true), []);

  const ask = async (nextQuestion: string) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || loading) return;
    const userMessage: ChatMessage = { id: `user-${messageCounter.current += 1}`, role: 'user', text: trimmed };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setLoading(true);
    try {
      const response = await fetch('/api/genie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = await response.json() as {
        answer?: string;
        error?: string;
        status?: 'answered' | 'not_found';
        sources?: GenieSource[];
      };
      if (!response.ok) throw new Error(payload.error || 'Genie could not answer right now.');
      setMessages((current) => [...current, {
        id: `assistant-${messageCounter.current += 1}`,
        role: 'assistant',
        text: payload.answer || 'I couldn’t find that in the approved policies.',
        status: payload.status,
        sources: payload.sources || [],
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
            <p>BSmile’s approved policy assistant</p>
          </div>
        </div>
        <div className="genie-scope-pill"><LockKeyhole size={14} /> Approved policies only</div>
      </header>

      <div className="genie-workspace">
        <section className="genie-chat-panel" aria-label="Chat with Genie">
          <div className="genie-thread" aria-live="polite" aria-busy={loading}>
            {messages.map((message) => (
              <article className={`genie-message genie-message-${message.role}${message.status ? ` is-${message.status}` : ''}`} key={message.id}>
                {message.role === 'assistant' && <GenieMark small />}
                <div className="genie-message-content">
                  <span className="genie-speaker">{message.role === 'assistant' ? 'Genie' : 'You'}</span>
                  <p>{message.text}</p>
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
            <label htmlFor="genie-question">Ask a policy question</label>
            <div>
              <textarea
                id="genie-question"
                value={question}
                maxLength={400}
                rows={1}
                placeholder="e.g. What is the leave approval process?"
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
            <h2>Three approved sources</h2>
            <p>Genie cannot browse the web or search any BSmile operational records.</p>
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
              <p>No client, CRM, Finance, or private profile data is available to Genie.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
