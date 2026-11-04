'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUp, Plus, Terminal, X } from 'lucide-react';
import WorkspaceMarkdown from './WorkspaceMarkdown';
import { useOnlineStatus } from './useOnlineStatus';

type DevConversationListItem = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type DevMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
  createdAt?: string | null;
  toolTrace?: Array<{ name: string; ok: boolean; summary: string }>;
  error?: boolean;
};

type DevConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    provider?: string | null;
    createdAt?: string | null;
  }>;
};

type IntegrationStatus = {
  github: {
    configured: boolean;
    authenticated: boolean;
    login: string | null;
    authError: string | null;
    repo: string;
    defaultBranch: string;
    writesEnabled: boolean;
  };
  vercel: {
    detected: boolean;
    tokenConfigured: boolean;
  };
};

function formatThreadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function initialMessages(conversation: DevConversation | null): DevMessage[] {
  if (!conversation) return [];

  return conversation.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    provider: message.provider || null,
    createdAt: message.createdAt || null,
  }));
}

function StatusChip({
  label,
  tone,
  title,
}: {
  label: string;
  tone: 'ok' | 'off' | 'warn';
  title?: string;
}) {
  return (
    <span className={`pw-dev-status pw-dev-status-${tone}`} title={title}>
      <span className="pw-dev-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export default function DevWorkspace({
  conversations,
  conversation,
  integration,
  migrationRequired,
}: {
  conversations: DevConversationListItem[];
  conversation: DevConversation | null;
  integration: IntegrationStatus;
  migrationRequired: boolean;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [messages, setMessages] = useState<DevMessage[]>(() => initialMessages(conversation));
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(conversation?.id ?? null);
  const [title, setTitle] = useState(conversation?.title ?? 'Dev-тред');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(200, textarea.scrollHeight)}px`;
  }, [draft]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (messages.length === 0 && !loading) {
      element.scrollTop = 0;
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [loading, messages.length]);

  function resetThread() {
    setMessages([]);
    setDraft('');
    setConversationId(null);
    setTitle('Dev-тред');
    setError(null);
    setThreadsOpen(false);
    router.replace('/admin/pierrot/dev');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function send() {
    const text = draft.trim();
    if (!text || loading || !online) return;

    setLoading(true);
    setError(null);
    setDraft('');
    setThreadsOpen(false);
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);

    if (messages.length === 0) {
      setTitle(text.length > 92 ? `${text.slice(0, 89).trimEnd()}…` : text);
    }

    try {
      const response = await fetch('/api/admin/pierrot/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(conversationId ? { conversationId } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.error || `Dev request failed (${response.status}).`
        );
      }

      if (!mountedRef.current) return;

      if (typeof payload?.conversationId === 'string') {
        setConversationId(payload.conversationId);
      }

      setMessages((current) => [
        ...current,
        {
          id: `reply-${Date.now()}`,
          role: 'assistant',
          content: String(payload?.reply || ''),
          provider: typeof payload?.provider === 'string' ? payload.provider : null,
          createdAt: new Date().toISOString(),
          toolTrace: Array.isArray(payload?.toolTrace) ? payload.toolTrace : [],
        },
      ]);

      router.refresh();
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Dev request failed.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  }

  return (
    <div className="pw-dev">
      <aside
        className="pw-dev-threads"
        data-open={threadsOpen ? 'true' : 'false'}
        aria-label="Dev-треды"
      >
        <div className="pw-dev-threads-head">
          <span className="pw-dev-label">DEV THREADS</span>
          <button
            type="button"
            className="pw-icon-button"
            onClick={() => setThreadsOpen(false)}
            aria-label="Закрыть список тредов"
          >
            <X size={17} strokeWidth={1.4} aria-hidden="true" />
          </button>
        </div>

        <button type="button" className="pw-dev-new" onClick={resetThread}>
          <Plus size={15} aria-hidden="true" />
          Новый тред
        </button>

        {conversations.length === 0 ? (
          <p className="pw-dev-threads-empty">Dev-тредов пока нет.</p>
        ) : (
          <ul className="pw-dev-thread-list">
            {conversations.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/pierrot/dev?conversation=${encodeURIComponent(item.id)}`}
                  className="pw-dev-thread-link"
                  aria-current={conversationId === item.id ? 'page' : undefined}
                  onClick={() => setThreadsOpen(false)}
                >
                  <span>{item.title}</span>
                  <small>
                    {formatThreadDate(item.updatedAt)} · {item.messageCount}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {threadsOpen && (
        <button
          type="button"
          className="pw-dev-scrim"
          aria-label="Закрыть список тредов"
          onClick={() => setThreadsOpen(false)}
        />
      )}

      <section className="pw-dev-main" aria-label="Pierrot Dev">
        <header className="pw-dev-head">
          <div className="pw-dev-head-title">
            <button
              type="button"
              className="pw-dev-threads-toggle"
              onClick={() => setThreadsOpen(true)}
              aria-label="Открыть список Dev-тредов"
            >
              <Terminal size={17} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <div>
              <p className="pw-dev-kicker">PIERROT · DEV</p>
              <h1>{title}</h1>
            </div>
          </div>

          <div className="pw-dev-statuses" aria-label="Статус интеграций">
            <StatusChip
              label={
                integration.github.authenticated
                  ? `GitHub · @${integration.github.login || 'authenticated'}`
                  : integration.github.configured
                    ? 'GitHub · auth failed'
                    : 'GitHub · off'
              }
              tone={
                integration.github.authenticated
                  ? 'ok'
                  : integration.github.configured
                    ? 'warn'
                    : 'off'
              }
              title={
                integration.github.authenticated
                  ? `${integration.github.repo} · branch ${integration.github.defaultBranch}`
                  : integration.github.authError ||
                    'GITHUB_TOKEN не настроен'
              }
            />
            <StatusChip
              label={`Vercel · ${integration.vercel.detected ? 'detected' : 'off'}`}
              tone={integration.vercel.detected ? 'ok' : 'off'}
              title={
                integration.vercel.tokenConfigured
                  ? 'Vercel token configured'
                  : 'Vercel project env not detected'
              }
            />
            <StatusChip
              label={
                integration.github.writesEnabled ? 'writes on' : 'writes off'
              }
              tone={integration.github.writesEnabled ? 'warn' : 'off'}
              title="PIERROT_DEV_WRITE_ENABLED"
            />
          </div>
        </header>

        {migrationRequired && (
          <div className="pw-dev-banner" role="alert">
            Нужна миграция <code>2026-11-17_pierrot_dev_mode.sql</code>. Без неё
            Dev-треды не сохраняются в Supabase.
          </div>
        )}

        <div className="pw-dev-scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="pw-dev-empty">
              <p className="pw-dev-kicker">ISOLATED THREAD</p>
              <h2>Dev-тред пуст.</h2>
              <p>
                Пьеро читает GitHub через tools, предлагает код и может создать
                коммит или PR. Обычный RAG и история чата сюда не подмешиваются.
              </p>
              <div className="pw-dev-suggestions">
                <button
                  type="button"
                  onClick={() => setDraft('Покажи структуру репозитория в app/admin/pierrot')}
                >
                  структура репозитория
                </button>
                <button
                  type="button"
                  onClick={() => setDraft('Прочитай lib/pierrot/workspace/navigation.ts')}
                >
                  прочитать файл
                </button>
                <button
                  type="button"
                  onClick={() => setDraft('Найди риск регрессии в PWA Pierrot')}
                >
                  риск регрессии
                </button>
              </div>
            </div>
          ) : (
            <div className="pw-dev-thread">
              {messages.map((message) =>
                message.role === 'user' ? (
                  <article key={message.id} className="pw-dev-message-user">
                    <p>{message.content}</p>
                  </article>
                ) : (
                  <article key={message.id} className="pw-dev-message-assistant">
                    <div className="pw-dev-message-head">
                      <span>PIERROT · DEV</span>
                      {message.provider && <span>{message.provider}</span>}
                    </div>
                    <WorkspaceMarkdown
                      className="pw-dev-answer"
                      content={message.content}
                    />
                    {message.toolTrace && message.toolTrace.length > 0 && (
                      <div className="pw-dev-tools" aria-label="GitHub tools">
                        {message.toolTrace.map((tool, index) => (
                          <span
                            key={`${tool.name}-${index}`}
                            className={tool.ok ? 'is-ok' : 'is-error'}
                            title={tool.summary}
                          >
                            {tool.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                )
              )}

              {loading && (
                <p className="pw-dev-typing" role="status">
                  DEV · думает и вызывает tools
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="pw-dev-error" role="alert">
            {error}
          </div>
        )}

        <div className="pw-dev-composer-wrap">
          <div className="pw-dev-composer">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={online ? 'Запрос к репозиторию или коду…' : 'Нет соединения'}
              rows={1}
              disabled={!online}
              aria-label="Сообщение Pierrot Dev"
            />
            <button
              type="button"
              className="pw-dev-send"
              onClick={() => void send()}
              disabled={!online || loading || !draft.trim()}
              aria-label="Отправить в Dev"
            >
              <ArrowUp size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
          <div className="pw-dev-meta">
            <span>mode=dev · no RAG · GitHub tools</span>
            <span>
              {integration.github.configured
                ? integration.github.writesEnabled
                  ? 'writes enabled'
                  : 'read-only'
                : 'GitHub off'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
