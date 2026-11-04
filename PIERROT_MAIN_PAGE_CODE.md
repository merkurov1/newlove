# Pierrot PWA — код главной страницы

Главная страница PWA — это `/admin/pierrot` (CHAT). Это не публичная главная сайта.

Ниже — актуальный код. В конце — полный CSS.

## Состав

- `app/admin/pierrot/(workspace)/layout.tsx`
- `app/admin/pierrot/(workspace)/page.tsx`
- `components/pierrot/workspace/WorkspaceShell.tsx`
- `components/pierrot/workspace/ChatWorkspace.tsx`
- `components/pierrot/workspace/PierrotAvatar.tsx`
- `components/pierrot/workspace/WorkspaceMarkdown.tsx`
- `components/pierrot/workspace/MetricStatusList.tsx`
- `components/pierrot/workspace/CommercialReport.tsx`
- `components/pierrot/workspace/Sparkline.tsx`
- `components/pierrot/workspace/useOnlineStatus.ts`
- `lib/pierrot/workspace/types.ts`
- `lib/pierrot/workspace/status.ts`
- `lib/pierrot/workspace/chatParser.ts`
- `lib/pierrot/workspace/citations.ts`
- `lib/pierrot/workspace/data.ts`
- `lib/pierrot/commercialSummary.ts`
- `app/admin/pierrot/(workspace)/workspace.css`

## `app/admin/pierrot/(workspace)/layout.tsx`

```tsx
import type { Metadata, Viewport } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import WorkspaceShell from '@/components/pierrot/workspace/WorkspaceShell';

import './workspace.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Pierrot',
    template: '%s · Pierrot',
  },
  applicationName: 'Pierrot',
  description: 'Owner workspace for merkurov.love.',
  robots: { index: false, follow: false },
  manifest: '/admin/pierrot/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/admin/pierrot-icon/192', sizes: '192x192', type: 'image/png' },
      { url: '/admin/pierrot-icon/512', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/admin/pierrot-icon/180', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Pierrot',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#F8F6F1',
};

export default async function PierrotWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return <WorkspaceShell>{children}</WorkspaceShell>;
}

```

## `app/admin/pierrot/(workspace)/page.tsx`

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/serverAuth';
import {
  loadOwnerConversation,
  loadOwnerConversations,
  loadWorkspaceOverview,
} from '@/lib/pierrot/workspace/data';
import { buildOverviewSummary } from '@/lib/pierrot/workspace/status';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import ChatWorkspace from '@/components/pierrot/workspace/ChatWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CHAT',
};

function unavailableOverview(): WorkspaceOverview {
  const metrics = [
    ['users', 'Пользователи'],
    ['subscribers', 'Подписчики'],
    ['flow', 'Flow'],
    ['conversations', 'Диалоги'],
    ['media', 'Медиа'],
  ].map(([key, label]) => ({
    key: key as WorkspaceOverview['metrics'][number]['key'],
    label,
    current: 0,
    periodCount: 0,
    previousCount: 0,
    state: null,
    series: null,
    available: false,
  }));

  return {
    period: 7,
    from: new Date().toISOString(),
    to: new Date().toISOString(),
    metrics,
    commercial: emptyCommercialSummary('last_7_days', new Date()),
    summary: buildOverviewSummary(metrics),
    generatedAt: new Date().toISOString(),
  };
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await requireAdmin();
  const params = searchParams || {};
  const rawConversation = Array.isArray(params.conversation)
    ? params.conversation[0]
    : params.conversation;
  const startNew = (Array.isArray(params.new) ? params.new[0] : params.new) === '1';

  const [conversations, conversation] = await Promise.all([
    loadOwnerConversations(user.id),
    rawConversation ? loadOwnerConversation(user.id, rawConversation) : Promise.resolve(null),
  ]);

  if (rawConversation && !conversation) {
    redirect('/admin/pierrot');
  }

  // The five metrics and the commercial report are only rendered by the empty
  // state. Do not spend owner-data queries on a transcript that is already open.
  const needsOverview = startNew || !conversation || conversation.messages.length === 0;
  const overview = needsOverview
    ? await loadWorkspaceOverview(7).catch(() => unavailableOverview())
    : unavailableOverview();

  return (
    <ChatWorkspace
      key={conversation?.id || 'new'}
      overview={overview}
      conversations={conversations}
      conversation={conversation}
      startNew={startNew}
    />
  );
}

```

## `components/pierrot/workspace/WorkspaceShell.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Brain,
  MessageSquare,
  Send,
} from 'lucide-react';
import PierrotAvatar from './PierrotAvatar';
import {
  WORKSPACE_ROUTES,
  activeWorkspaceKey,
  shortcutRoute,
} from '@/lib/pierrot/workspace/navigation';

const ICONS = {
  chat: MessageSquare,
  brain: Brain,
  flow: Send,
  dash: Activity,
} as const;

function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('/pierrot-sw.js', { scope: '/admin/pierrot' })
    .catch(() => {
      // Offline shell is an enhancement; the workspace stays fully usable.
    });
}

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/admin/pierrot';
  const router = useRouter();
  const active = activeWorkspaceKey(pathname);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const route = shortcutRoute(event, event.target);
      if (!route) return;

      event.preventDefault();

      if (route.key === 'new-chat') {
        router.push('/admin/pierrot?new=1');
        return;
      }

      const item = WORKSPACE_ROUTES.find((entry) => entry.key === route.key);
      if (item) router.push(item.path);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <div className="pw-root">
      <nav className="pw-rail" aria-label="Pierrot workspace">
        <Link href="/admin/pierrot" className="pw-rail-brand" aria-label="Pierrot">
          <PierrotAvatar size={32} />
        </Link>

        <div className="pw-rail-list">
          {WORKSPACE_ROUTES.map((item) => {
            const Icon = ICONS[item.key];
            const isActive = active === item.key;

            return (
              <Link
                key={item.key}
                href={item.path}
                className="pw-rail-link"
                aria-current={isActive ? 'page' : undefined}
                title={`${item.label} · Cmd+${item.shortcut}`}
                onClick={(event) => {
                  if (item.key === 'chat' && isActive) {
                    event.preventDefault();
                    window.dispatchEvent(new CustomEvent('pierrot:toggle-drawer'));
                  }
                }}
              >
                <Icon size={24} strokeWidth={1.4} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

      </nav>

      <main className="pw-main">{children}</main>
    </div>
  );
}

```

## `components/pierrot/workspace/ChatWorkspace.tsx`

```tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  MessageSquare,
  PanelLeft,
  Plus,
  X,
} from 'lucide-react';
import type {
  OwnerConversation,
  OwnerConversationListItem,
  WorkspaceOverview,
} from '@/lib/pierrot/workspace/types';
import {
  parsePierrotResponse,
  retrievalStateLabel,
  sourceTypeLabel,
  totalSourceCount,
  type SourceBundle,
} from '@/lib/pierrot/workspace/chatParser';
import { getPierrotConsent, setPierrotConsent } from '@/lib/pierrot/clientTelemetry';
import { setWorkspaceHandoff } from '@/lib/pierrot/workspace/handoff';
import { CommercialBrief } from './CommercialReport';
import MetricStatusList from './MetricStatusList';
import WorkspaceMarkdown from './WorkspaceMarkdown';
import PierrotAvatar from './PierrotAvatar';
import { useOnlineStatus } from './useOnlineStatus';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  provider?: string | null;
  serverMessageId?: string | null;
  feedback?: 'up' | 'down';
  feedbackError?: boolean;
  sources?: SourceBundle;
  answerLabel?: string | null;
  error?: boolean;
};

type SelectedSources = {
  messageId: string;
  label: string;
  bundle: SourceBundle;
  index: number | null;
};

type Consent = {
  state: 'pending' | 'granted' | 'denied';
  version: string | null;
};

function formatConversationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return new Intl.DateTimeFormat('ru-RU', {
    ...(sameDay ? {} : { day: '2-digit', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function messageLabel(message: UiMessage): string {
  return message.role === 'user' ? 'Вы' : 'Pierrot';
}

function initialMessages(conversation: OwnerConversation | null): UiMessage[] {
  if (!conversation) return [];

  return conversation.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    provider: message.provider || null,
    serverMessageId: message.id,
  }));
}

export default function ChatWorkspace({
  overview,
  conversations,
  conversation,
  startNew,
}: {
  overview: WorkspaceOverview;
  conversations: OwnerConversationListItem[];
  conversation: OwnerConversation | null;
  startNew: boolean;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [messages, setMessages] = useState<UiMessage[]>(() => initialMessages(conversation));
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(conversation?.id ?? null);
  const [sessionId, setSessionId] = useState<string | null>(conversation?.sessionId ?? null);
  const [title, setTitle] = useState<string>(conversation?.title ?? 'Новый диалог');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<SelectedSources | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<Consent>(() => ({
    state:
      conversation?.consentState === 'granted'
        ? 'granted'
        : conversation?.consentState === 'denied'
          ? 'denied'
          : 'pending',
    version: null,
  }));

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inspectorScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (conversation?.consentState === 'granted' || conversation?.consentState === 'denied') {
      return;
    }
    setConsent(getPierrotConsent());
  }, [conversation?.consentState]);

  useEffect(() => {
    function toggle() {
      setDrawerOpen((open) => !open);
      setInspectorOpen(false);
    }

    window.addEventListener('pierrot:toggle-drawer', toggle as EventListener);
    return () => window.removeEventListener('pierrot:toggle-drawer', toggle as EventListener);
  }, []);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setDraft('');
    setConversationId(null);
    setSessionId(null);
    setTitle('Новый диалог');
    setSelectedSources(null);
    setInspectorOpen(false);
    setMenuOpenId(null);
    setError(null);
    setLoading(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!startNew) return;
    resetConversation();
    router.replace('/admin/pierrot');
  }, [resetConversation, router, startNew]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (messages.length === 0 && !loading) {
      element.scrollTop = 0;
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [messages.length, loading]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(168, element.scrollHeight)}px`;
  }, [draft]);

  const sourceCount = useMemo(() => {
    if (!selectedSources) return 0;
    return totalSourceCount(selectedSources.bundle);
  }, [selectedSources]);

  useEffect(() => {
    if (!inspectorOpen || selectedSources?.index == null) return;
    const target = inspectorScrollRef.current?.querySelector<HTMLElement>(
      `#pw-source-${selectedSources.index}`
    );
    target?.scrollIntoView({ block: 'nearest' });
  }, [inspectorOpen, selectedSources]);

  function allowSaving() {
    const next = setPierrotConsent('granted');
    setConsent(next);
  }

  function stopSaving() {
    const next = setPierrotConsent('denied');
    setConsent(next);
  }

  async function submitFeedback(
    message: UiMessage,
    rating: 'up' | 'down'
  ) {
    if (message.feedback || consent.state !== 'granted') return;
    if (!conversationId || !sessionId || !message.serverMessageId) return;

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? { ...item, feedback: rating, feedbackError: false }
          : item
      )
    );

    try {
      const response = await fetch('/api/pierrot/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          sessionId,
          eventName: 'answer_feedback',
          eventKey: message.serverMessageId,
          payload: { rating, message_id: message.serverMessageId },
          consent,
          context: { pathname: '/admin/pierrot' },
        }),
      });

      if (!response.ok) throw new Error('feedback_failed');
    } catch {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, feedbackError: true } : item
        )
      );
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || loading || !online) return;

    setError(null);
    setLoading(true);
    setDraft('');
    setMenuOpenId(null);

    const userMessage: UiMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    if (messages.length === 0) {
      setTitle(text.length > 92 ? `${text.slice(0, 89).trimEnd()}…` : text);
    }

    const history = messages
      .filter((message) => !message.error)
      .map((message) => ({ role: message.role, content: message.content }));

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch('/api/pierrot-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          ...(conversationId ? { conversationId } : {}),
          ...(sessionId ? { sessionId } : {}),
          consent:
            consent.state === 'granted'
              ? { state: 'granted', version: consent.version }
              : consent.state === 'denied'
                ? { state: 'denied', version: consent.version }
                : { state: 'pending', version: consent.version },
          context: {
            pathname: '/admin/pierrot',
            referrer: typeof document !== 'undefined' ? document.referrer : undefined,
          },
          history,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      const parsed = parsePierrotResponse(payload);

      if (!response.ok) {
        throw new Error(
          parsed.error
            ? `${parsed.error}${parsed.code ? ` · ${parsed.code}` : ''}`
            : `Запрос не выполнен (${response.status}).`
        );
      }

      if (!parsed.reply) {
        throw new Error('Pierrot не вернул текст ответа.');
      }

      if (!mountedRef.current) return;

      setMessages((current) => [
        ...current,
        {
          id: `reply-${Date.now()}`,
          role: 'assistant',
          content: parsed.reply as string,
          createdAt: new Date().toISOString(),
          provider: parsed.provider,
          serverMessageId: parsed.assistantMessageId,
          sources: parsed.sources,
          answerLabel: parsed.answerLabel,
        },
      ]);

      if (parsed.conversationId) setConversationId(parsed.conversationId);
      if (parsed.sessionId) setSessionId(parsed.sessionId);

      if (parsed.recorded) {
        router.refresh();
      } else {
        setError(
          'Ответ получен, но диалог не сохранён: сохранение выключено или не разрешено.'
        );
      }
    } catch (caught) {
      if (!mountedRef.current) return;

      const isAbort =
        caught instanceof DOMException
          ? caught.name === 'AbortError'
          : caught instanceof Error && caught.name === 'AbortError';

      setError(
        isAbort
          ? 'Ответ не пришёл за 60 секунд. Сообщение не отправлено повторно автоматически.'
          : caught instanceof Error
            ? caught.message
            : 'Не удалось получить ответ.'
      );
    } finally {
      window.clearTimeout(timeout);
      if (mountedRef.current) setLoading(false);
      abortRef.current = null;
    }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  }

  function handoff(kind: 'brain' | 'flow', message: UiMessage) {
    setWorkspaceHandoff({ kind, text: message.content });
    router.push(kind === 'brain' ? '/admin/pierrot/brain' : '/admin/pierrot/flow');
  }

  function openSources(message: UiMessage, index = 0) {
    if (!message.sources || totalSourceCount(message.sources) === 0) return;

    setSelectedSources({
      messageId: message.id,
      label: messageLabel(message),
      bundle: message.sources,
      index: Math.max(0, Math.min(index, totalSourceCount(message.sources) - 1)),
    });
    setInspectorOpen(true);
    setMenuOpenId(null);
  }

  function closePanels() {
    setDrawerOpen(false);
    setInspectorOpen(false);
  }

  return (
    <div
      className="pw-chat"
      data-drawer={drawerOpen ? 'open' : 'closed'}
      data-inspector={inspectorOpen ? 'open' : 'closed'}
    >
      {(drawerOpen || inspectorOpen) && (
        <button
          type="button"
          className="pw-scrim"
          aria-label="Закрыть панель"
          onClick={closePanels}
        />
      )}

      <aside className="pw-drawer" aria-label="Диалоги">
        <div className="pw-drawer-inner">
          <div className="pw-panel-head">
            <span className="pw-section-title">Диалоги</span>
            <button
              type="button"
              className="pw-icon-button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Закрыть список диалогов"
            >
              <X size={20} strokeWidth={1.4} aria-hidden="true" />
            </button>
          </div>

          <div className="pw-drawer-scroll">
            <button
              type="button"
              className="pw-new-chat"
              onClick={() => {
                resetConversation();
                setDrawerOpen(false);
                router.replace('/admin/pierrot');
              }}
            >
              <Plus size={18} strokeWidth={1.4} aria-hidden="true" />
              Новый диалог
            </button>

            {conversations.length === 0 ? (
              <p className="pw-drawer-empty">
                Сохранённых диалогов нет. Они появляются здесь только при включённом
                сохранении и после ответа Pierrot.
              </p>
            ) : (
              <ul className="pw-conversation-list">
                {conversations.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/admin/pierrot?conversation=${encodeURIComponent(item.id)}`}
                      className="pw-conversation-link"
                      aria-current={conversationId === item.id ? 'page' : undefined}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <span className="pw-conversation-title">{item.title}</span>
                      <span className="pw-conversation-date">
                        {formatConversationDate(item.updatedAt)} · {item.messageCount}{' '}
                        {item.messageCount === 1 ? 'сообщение' : 'сообщений'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      <section className="pw-center" aria-label="Разговор с Pierrot">
        <header className="pw-chat-head">
          <button
            type="button"
            className="pw-icon-button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label={drawerOpen ? 'Скрыть список диалогов' : 'Показать список диалогов'}
            aria-expanded={drawerOpen}
          >
            <PanelLeft size={20} strokeWidth={1.4} aria-hidden="true" />
          </button>

          <span className="pw-chat-head-dialog" aria-hidden="true">
            <MessageSquare size={16} strokeWidth={1.4} />
          </span>

          <div className="pw-chat-head-copy">
            <h1 className="pw-chat-head-title">{title}</h1>
            <span className="pw-chat-head-sub">owner workspace</span>
          </div>

          {!online && (
            <span className="pw-chat-head-meta" role="status">
              offline
            </span>
          )}
        </header>

        <div className="pw-chat-scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="pw-empty">
              <p className="pw-kicker">Pierrot · owner workspace</p>
              <h2 className="pw-empty-title">Всё спокойно.</h2>
              <p className="pw-empty-summary">{overview.summary}</p>
              <CommercialBrief summary={overview.commercial} />
              <MetricStatusList metrics={overview.metrics} />
            </div>
          ) : (
            <div className="pw-chat-thread">
              {messages.map((message) => {
                const messageSourceCount = message.sources
                  ? totalSourceCount(message.sources)
                  : 0;

                return (
                  <article
                    key={message.id}
                    className={`pw-message ${
                      message.role === 'user' ? 'pw-message-user' : ''
                    }`}
                  >
                    {message.role === 'user' ? (
                      <div className="pw-bubble-user">{message.content}</div>
                    ) : (
                      <>
                        <div className="pw-message-head">
                          <div className="pw-message-head-left">
                            <PierrotAvatar size={24} />
                            <span className="pw-message-label">
                              Pierrot
                              {message.provider ? ` · ${message.provider}` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="pw-message-menu"
                            aria-label="Действия с сообщением"
                            aria-expanded={menuOpenId === message.id}
                            onClick={() =>
                              setMenuOpenId((current) =>
                                current === message.id ? null : message.id
                              )
                            }
                          >
                            ···
                          </button>
                        </div>

                        {menuOpenId === message.id && (
                          <div className="pw-message-actions">
                            <button type="button" onClick={() => handoff('brain', message)}>
                              В Brain
                            </button>
                            <button type="button" onClick={() => handoff('flow', message)}>
                              Во Flow
                            </button>
                          </div>
                        )}

                        <WorkspaceMarkdown
                          className="pw-reply"
                          content={message.content}
                          citationCount={messageSourceCount}
                          onCitation={(index) => openSources(message, index)}
                        />

                        <div className="pw-feedback" role="group" aria-label="Оценка ответа">
                          <span className="pw-feedback-label">Ответ полезен?</span>
                          <button
                            type="button"
                            className="pw-feedback-button"
                            aria-label="Ответ полезен"
                            aria-pressed={message.feedback === 'up'}
                            disabled={
                              consent.state !== 'granted' ||
                              !conversationId ||
                              !sessionId ||
                              !message.serverMessageId ||
                              Boolean(message.feedback)
                            }
                            title={
                              consent.state !== 'granted'
                                ? 'Для оценки нужно разрешить сохранение'
                                : 'Оценить ответ'
                            }
                            onClick={() => void submitFeedback(message, 'up')}
                          >
                            Да
                          </button>
                          <span className="pw-feedback-sep" aria-hidden="true">
                            /
                          </span>
                          <button
                            type="button"
                            className="pw-feedback-button"
                            aria-label="Ответ не полезен"
                            aria-pressed={message.feedback === 'down'}
                            disabled={
                              consent.state !== 'granted' ||
                              !conversationId ||
                              !sessionId ||
                              !message.serverMessageId ||
                              Boolean(message.feedback)
                            }
                            title={
                              consent.state !== 'granted'
                                ? 'Для оценки нужно разрешить сохранение'
                                : 'Оценить ответ'
                            }
                            onClick={() => void submitFeedback(message, 'down')}
                          >
                            Нет
                          </button>
                          {message.feedbackError && (
                            <span className="pw-feedback-error">не отправлено</span>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}

              {loading && (
                <p className="pw-typing" role="status" aria-live="polite">
                  <span aria-hidden="true" />
                  Pierrot формулирует ответ
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div
            className="pw-notice pw-notice-warning"
            style={{ margin: '0 28px 12px' }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="pw-composer-wrap">
          <div className="pw-composer-inner">
            <label className="pw-kicker" htmlFor="pw-composer" style={{ display: 'none' }}>
              Сообщение Пьеро
            </label>
            <textarea
              id="pw-composer"
              ref={inputRef}
              className="pw-composer-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={online ? 'Напишите Пьеро' : 'Нет соединения'}
              rows={1}
              disabled={!online}
              aria-label="Сообщение Пьеро"
            />

            <button
              type="button"
              className="pw-send"
              onClick={() => void send()}
              disabled={!online || loading || !draft.trim()}
              aria-label="Отправить сообщение"
            >
              <ArrowUp size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>

          <div className="pw-composer-meta">
            <span>
              {consent.state === 'granted'
                ? 'Сохранение включено · до 90 дней'
                : consent.state === 'denied'
                  ? 'Сохранение выключено'
                  : 'Сохранение не разрешено'}
            </span>
            <button
              type="button"
              className="pw-link-button"
              onClick={consent.state === 'granted' ? stopSaving : allowSaving}
            >
              {consent.state === 'granted' ? 'Не сохранять' : 'Разрешить сохранение'}
            </button>
          </div>
        </div>
      </section>

      <aside className="pw-inspector" aria-label="Источники ответа">
        <div className="pw-inspector-inner">
          <div className="pw-panel-head">
            <div>
              <span className="pw-section-title">Источники</span>
              <p className="pw-inspector-title">
                {selectedSources
                  ? selectedSources.index === null
                    ? `${sourceCount} ${sourceCount === 1 ? 'источник' : 'источников'}`
                    : `Источник ${selectedSources.index + 1} из ${sourceCount}`
                  : 'Не выбрано'}
              </p>
            </div>
            <button
              type="button"
              className="pw-icon-button"
              onClick={() => setInspectorOpen(false)}
              aria-label="Закрыть источники"
            >
              <X size={20} strokeWidth={1.4} aria-hidden="true" />
            </button>
          </div>

          <div className="pw-inspector-scroll" ref={inspectorScrollRef}>
            {!selectedSources ? (
              <p className="pw-inspector-empty">
                Нажмите на инлайн-бейдж источника в ответе, чтобы открыть его здесь.
              </p>
            ) : (
              <>
                <div className="pw-inspector-section">
                  <p className="pw-section-title">Состояние retrieval</p>
                  <p className="pw-source-title">
                    {retrievalStateLabel(
                      selectedSources.bundle.outcome,
                      selectedSources.bundle.code
                    )}
                  </p>
                  {selectedSources.bundle.code && (
                    <p className="pw-source-meta">code: {selectedSources.bundle.code}</p>
                  )}
                  {selectedSources.bundle.mode && (
                    <p className="pw-source-meta">mode: {selectedSources.bundle.mode}</p>
                  )}
                </div>

                <div className="pw-inspector-section">
                  {sourceCount === 0 ? (
                    <p className="pw-inspector-empty" style={{ padding: 0 }}>
                      Источники не переданы. Запросы не придумываются.
                    </p>
                  ) : (
                    <>
                      {selectedSources.bundle.brain.map((source, index) => (
                        <div
                          key={`${source.documentId || 'brain'}-${index}`}
                          id={`pw-source-${index}`}
                          className={`pw-inspector-source${
                            selectedSources.index === index ? ' is-active' : ''
                          }`}
                        >
                          <span className="pw-source-type">{sourceTypeLabel(source)}</span>
                          <h3 className="pw-source-title">
                            {source.documentTitle || source.heading || 'Без названия'}
                          </h3>
                          <p className="pw-source-meta">
                            {[source.sourceDomain, source.author, source.publishedAt?.slice(0, 10)]
                              .filter(Boolean)
                              .join(' · ') || 'метаданные не переданы'}
                          </p>
                          {source.excerpt && (
                            <p className="pw-source-excerpt">{source.excerpt}</p>
                          )}
                          {source.canonicalUrl && (
                            <a
                              className="pw-source-link"
                              href={source.canonicalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              открыть источник
                            </a>
                          )}
                        </div>
                      ))}

                      {selectedSources.bundle.web.map((source, index) => {
                        const globalIndex = selectedSources.bundle.brain.length + index;
                        return (
                        <div
                          key={`web-${index}`}
                          id={`pw-source-${globalIndex}`}
                          className={`pw-inspector-source${
                            selectedSources.index === globalIndex ? ' is-active' : ''
                          }`}
                        >
                          <span className="pw-source-type">веб</span>
                          <h3 className="pw-source-title">
                            {source.title || source.domain || 'Без названия'}
                          </h3>
                          <p className="pw-source-meta">
                            {[source.domain, source.publishedAt, source.author]
                              .filter(Boolean)
                              .join(' · ') || 'метаданные не переданы'}
                          </p>
                          {source.excerpt && (
                            <p className="pw-source-excerpt">{source.excerpt}</p>
                          )}
                          {source.url && (
                            <a
                              className="pw-source-link"
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              открыть источник
                            </a>
                          )}
                        </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

```

## `components/pierrot/workspace/PierrotAvatar.tsx`

```tsx
'use client';

import { useState } from 'react';
import { PIERROT_AVATAR_SRC } from '@/lib/pierrot/config';

export default function PierrotAvatar({
  size = 30,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`pw-avatar-badge ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {PIERROT_AVATAR_SRC && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={PIERROT_AVATAR_SRC}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="pw-avatar-fallback">P</span>
      )}
    </span>
  );
}

```

## `components/pierrot/workspace/WorkspaceMarkdown.tsx`

```tsx
'use client';

import React from 'react';
import Markdown from 'markdown-to-jsx';
import { safeSourceUrl } from '@/lib/pierrot/workspace/chatParser';
import {
  CITATION_HREF_PREFIX,
  citationIndexFromHref,
  prepareCitationMarkdown,
} from '@/lib/pierrot/workspace/citations';

function CitationBadge({
  index,
  onCitation,
}: {
  index: number;
  onCitation?: (index: number) => void;
}) {
  const content = <span aria-hidden="true">{index}</span>;

  if (!onCitation) {
    return (
      <span className="pw-cite" aria-label={`Источник ${index}`}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="pw-cite"
      onClick={() => onCitation(index - 1)}
      aria-label={`Открыть источник ${index}`}
    >
      {content}
    </button>
  );
}

export default function WorkspaceMarkdown({
  content,
  className = '',
  citationCount = 0,
  onCitation,
}: {
  content: string;
  className?: string;
  citationCount?: number;
  onCitation?: (index: number) => void;
}) {
  const prepared = prepareCitationMarkdown(content, citationCount);
  const hasRenderedCitation =
    citationCount > 0 && prepared.includes(CITATION_HREF_PREFIX);

  return (
    <div className={className}>
      <Markdown
        options={{
          disableParsingRawHTML: true,
          forceBlock: true,
          sanitizer: (value: string) => {
            if (value.startsWith(CITATION_HREF_PREFIX)) return value;
            return safeSourceUrl(value) || '';
          },
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
                children?: React.ReactNode;
              }) => {
                const citation = citationIndexFromHref(href || '');

                if (citation !== null) {
                  if (citation > citationCount) return <span>{children}</span>;
                  return (
                    <CitationBadge index={citation} onCitation={onCitation} />
                  );
                }

                const safe = safeSourceUrl(href || '');
                if (!safe) return <span>{children}</span>;
                const external = /^https?:\/\//i.test(safe);

                return (
                  <a
                    {...props}
                    href={safe}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {children}
                  </a>
                );
              },
            },
          },
        }}
      >
        {prepared}
      </Markdown>

      {citationCount > 0 && !hasRenderedCitation && (
        <span className="pw-citations" aria-label="Источники ответа">
          {Array.from({ length: citationCount }, (_, index) => (
            <CitationBadge
              key={index + 1}
              index={index + 1}
              onCitation={onCitation}
            />
          ))}
        </span>
      )}
    </div>
  );
}

```

## `components/pierrot/workspace/MetricStatusList.tsx`

```tsx
import type { WorkspaceMetric } from '@/lib/pierrot/workspace/types';
import { METRIC_STATE_COPY, metricDotTone } from '@/lib/pierrot/workspace/status';

export default function MetricStatusList({
  metrics,
  limit = 5,
}: {
  metrics: WorkspaceMetric[];
  limit?: number;
}) {
  return (
    <ul className="pw-status-list" aria-label="Состояние проектов">
      {metrics.slice(0, limit).map((metric) => (
        <li key={metric.key} className="pw-status-row">
          <span className="pw-status-label">{metric.label}</span>
          {metric.state ? (
            <span className="pw-status-word">{METRIC_STATE_COPY[metric.state]}</span>
          ) : (
            <span className="pw-status-missing">нет данных</span>
          )}
          <span
            className={`pw-dot pw-dot-${metricDotTone(metric.state)}`}
            aria-hidden="true"
          />
        </li>
      ))}
    </ul>
  );
}

```

## `components/pierrot/workspace/CommercialReport.tsx`

```tsx
import Link from 'next/link';
import {
  commercialVerdict,
  type CommercialSummary,
} from '@/lib/pierrot/commercialSummary';

export function CommercialBrief({ summary }: { summary: CommercialSummary }) {
  const verdict = commercialVerdict(summary);

  return (
    <section
      className={`pw-commercial-brief pw-commercial-${verdict.tone}`}
      aria-label="Короткий коммерческий отчёт"
    >
      <div className="pw-commercial-brief-head">
        <span className="pw-kicker">Деньги · {summary.periodLabel}</span>
        <Link href="/admin/pierrot/dash" className="pw-commercial-link">
          в статистику →
        </Link>
      </div>
      <p className="pw-commercial-verdict">{verdict.headline}</p>
      <p className="pw-commercial-detail">{verdict.detail}</p>
      {!summary.complete && (
        <p className="pw-commercial-partial">
          Часть источников недоступна: {summary.errors.join(' · ')}
        </p>
      )}
    </section>
  );
}

```

## `components/pierrot/workspace/Sparkline.tsx`

```tsx
import { buildSparklineGeometry } from '@/lib/pierrot/workspace/sparkline';

export default function Sparkline({
  series,
  label,
}: {
  series: number[] | null;
  label: string;
}) {
  const geometry = series ? buildSparklineGeometry(series) : null;

  if (!geometry) {
    return <div className="pw-spark-empty">нет ряда</div>;
  }

  return (
    <div className="pw-spark">
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label={`${label}: динамика за период`}
        preserveAspectRatio="none"
      >
        <path className="pw-spark-area" d={geometry.area} />
        <path className="pw-spark-line" d={geometry.line} />
      </svg>
    </div>
  );
}

```

## `components/pierrot/workspace/useOnlineStatus.ts`

```ts
'use client';

import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine !== false);
    }

    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

```

## `lib/pierrot/workspace/types.ts`

```ts
/**
 * Shared, client-safe contracts for the owner workspace.
 *
 * These types deliberately contain no message text beyond what the owner
 * explicitly opens, no secrets and no server-only imports.
 */

export const WORKSPACE_METRIC_KEYS = [
  'users',
  'subscribers',
  'flow',
  'conversations',
  'media',
] as const;

export type WorkspaceMetricKey = (typeof WORKSPACE_METRIC_KEYS)[number];

/**
 * The only states the interface is allowed to show for a metric. Missing data
 * is represented by `state: null` and rendered as "нет данных"; it is never
 * folded into "тихо" or zero.
 */
export type MetricState = 'растёт' | 'стоит' | 'падает' | 'тихо' | 'пухнет' | 'тревога';

export type WorkspaceMetric = {
  key: WorkspaceMetricKey;
  label: string;
  /** Current cumulative snapshot. */
  current: number;
  /** Additions in the current comparable period. */
  periodCount: number;
  /** Additions in the previous comparable period. */
  previousCount: number;
  /** null when the historical series is unavailable. */
  state: MetricState | null;
  /** Daily counts for the current period, oldest first. null when unavailable. */
  series: number[] | null;
  /** False when neither the snapshot nor the series could be read. */
  available: boolean;
};

export type WorkspacePeriod = 7 | 30;

import type { CommercialSummary } from '@/lib/pierrot/commercialSummary';

export type WorkspaceOverview = {
  period: WorkspacePeriod;
  from: string;
  to: string;
  metrics: WorkspaceMetric[];
  commercial: CommercialSummary;
  summary: string;
  generatedAt: string;
};

export type OwnerConversationListItem = {
  id: string;
  /** Needed to append to the existing session through the public API. */
  sessionId: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  consentState: 'pending' | 'granted' | 'denied' | null;
  messageCount: number;
};

export type OwnerChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string | null;
  provider?: string | null;
};

export type OwnerConversation = {
  id: string;
  sessionId: string;
  title: string;
  consentState: 'pending' | 'granted' | 'denied' | null;
  messages: OwnerChatMessage[];
};

export type BrainRecentSource = {
  id: string;
  title: string | null;
  sourceType: string | null;
  sourceFormat: string | null;
  status: string | null;
  errorCode: string | null;
  createdAt: string | null;
  documentId: string | null;
};

```

## `lib/pierrot/workspace/status.ts`

```ts
import type { MetricState, WorkspaceMetric } from './types';

/**
 * Deterministic status thresholds for the five workspace metrics.
 *
 * All comparisons use the same-length previous period. Small absolute numbers
 * are treated as quiet so two isolated events cannot masquerade as a trend.
 * The vocabulary is intentionally tiny and must not be extended in UI copy.
 */
export const METRIC_STATUS_THRESHOLDS = {
  /** Both periods at or below this count are "тихо". */
  quietMax: 2,
  /** Growth at or above +10% is "растёт". */
  growAt: 0.1,
  /** Growth at or above +50% is "пухнет". */
  surgeAt: 0.5,
  /** Decline deeper than -10% is "падает". */
  fallAt: -0.1,
  /** Decline at or below -40% is "тревога". */
  alarmAt: -0.4,
} as const;

export const METRIC_STATE_COPY: Record<MetricState, string> = {
  'растёт': 'растёт',
  'стоит': 'стоит',
  'падает': 'падает',
  'тихо': 'тихо',
  'пухнет': 'пухнет',
  'тревога': 'тревога',
};

export type MetricDotTone = 'growth' | 'attention' | 'neutral' | 'missing';

export function metricDotTone(state: MetricState | null): MetricDotTone {
  if (!state) return 'missing';
  if (state === 'растёт' || state === 'пухнет') return 'growth';
  if (state === 'падает' || state === 'тревога') return 'attention';
  return 'neutral';
}

export function classifyMetricState(
  current: number,
  previous: number
): MetricState {
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const safePrevious = Number.isFinite(previous) ? Math.max(0, previous) : 0;

  if (
    safeCurrent <= METRIC_STATUS_THRESHOLDS.quietMax &&
    safePrevious <= METRIC_STATUS_THRESHOLDS.quietMax
  ) {
    return 'тихо';
  }

  if (safePrevious === 0) {
    return safeCurrent >= METRIC_STATUS_THRESHOLDS.quietMax + 1 ? 'пухнет' : 'растёт';
  }

  const change = (safeCurrent - safePrevious) / safePrevious;

  if (change >= METRIC_STATUS_THRESHOLDS.surgeAt) return 'пухнет';
  if (change >= METRIC_STATUS_THRESHOLDS.growAt) return 'растёт';
  if (change >= METRIC_STATUS_THRESHOLDS.fallAt) return 'стоит';
  if (change > METRIC_STATUS_THRESHOLDS.alarmAt) return 'падает';
  return 'тревога';
}

/**
 * The empty-chat and DASH summary is built only from the five fixed states.
 * It never introduces a fact, number, cause or event that is not present in
 * the metric list.
 */
export function buildOverviewSummary(metrics: WorkspaceMetric[]): string {
  const available = metrics.filter((metric) => metric.state !== null);

  if (available.length === 0) {
    return 'Нет данных для сравнения. Показатели не рассчитаны.';
  }

  const noteworthy = available.filter(
    (metric) => metric.state !== 'стоит' && metric.state !== 'тихо'
  );

  if (noteworthy.length === 0) {
    return 'Показатели держатся ровно. Ничего не требует внимания.';
  }

  return noteworthy
    .map((metric) => `${metric.label} — ${metric.state}`)
    .join(', ')
    .replace(/,([^,]*)$/, ' и$1')
    .concat('.');
}

```

## `lib/pierrot/workspace/chatParser.ts`

```ts
/**
 * Client-safe parsing of the existing /api/pierrot-web JSON contract.
 * The endpoint is not streaming; this module never pretends that it is.
 */

export type BrainAnswerSource = {
  documentId: string | null;
  documentTitle: string | null;
  sourceType: string | null;
  sourceClass: string | null;
  sourceDomain: string | null;
  author: string | null;
  publishedAt: string | null;
  heading: string | null;
  excerpt: string | null;
  canonicalUrl: string | null;
  similarity: number | null;
  verificationStatus: string | null;
};

export type WebAnswerSource = {
  index: number | null;
  title: string | null;
  url: string | null;
  domain: string | null;
  publishedAt: string | null;
  author: string | null;
  excerpt: string | null;
};

export type SourceBundle = {
  brain: BrainAnswerSource[];
  web: WebAnswerSource[];
  outcome: string | null;
  code: string | null;
  mode: string | null;
  sourceStatus: Record<string, unknown> | null;
};

export type ParsedPierrotResponse = {
  reply: string | null;
  conversationId: string | null;
  sessionId: string | null;
  assistantMessageId: string | null;
  provider: string | null;
  model: string | null;
  answerLabel: string | null;
  recorded: boolean;
  sources: SourceBundle;
  error: string | null;
  code: string | null;
  retryAfter: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function safeSourceUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

export function parsePierrotResponse(payload: unknown): ParsedPierrotResponse {
  const root = asRecord(payload) || {};
  const rag = asRecord(root.rag);
  const rawBrainSources = Array.isArray(rag?.sources) ? rag?.sources : [];
  const web = asRecord(root.web);
  const rawWebSources = Array.isArray(web?.sources) ? web?.sources : [];
  const answerSources = asRecord(root.answerSources);

  const brain: BrainAnswerSource[] = rawBrainSources
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      documentId: text(entry.documentId),
      documentTitle: text(entry.documentTitle),
      sourceType: text(entry.sourceType),
      sourceClass: text(entry.sourceClass),
      sourceDomain: text(entry.sourceDomain),
      author: text(entry.author),
      publishedAt: text(entry.publishedAt),
      heading: text(entry.heading),
      excerpt: text(entry.excerpt),
      canonicalUrl: safeSourceUrl(entry.canonicalUrl),
      similarity: number(entry.similarity),
      verificationStatus: text(entry.verificationStatus),
    }))
    .slice(0, 30);

  const webSources: WebAnswerSource[] = rawWebSources
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      index: number(entry.index),
      title: text(entry.title),
      url: safeSourceUrl(entry.url),
      domain: text(entry.domain),
      publishedAt: text(entry.publishedAt),
      author: text(entry.author),
      excerpt: text(entry.excerpt),
    }))
    .slice(0, 30);

  return {
    reply: text(root.reply),
    conversationId: text(root.conversationId),
    sessionId: text(root.sessionId),
    assistantMessageId: text(root.assistantMessageId),
    provider: text(root.provider),
    model: text(root.model),
    answerLabel: text(answerSources?.label),
    recorded: root.recorded === true,
    sources: {
      brain,
      web: webSources,
      outcome: text(rag?.outcome),
      code: text(rag?.code),
      mode: text(rag?.mode),
      sourceStatus: asRecord(root.sourceStatus),
    },
    error: text(root.error),
    code: text(root.code),
    retryAfter: number(root.retryAfter),
  };
}

export function sourceTypeLabel(source: BrainAnswerSource): string {
  const type = source.sourceType || source.sourceClass || 'источник';

  switch (type) {
    case 'article':
      return 'статья';
    case 'pdf':
      return 'PDF';
    case 'txt':
      return 'TXT';
    case 'text':
      return 'заметка';
    case 'media_coverage':
      return 'медиа';
    case 'manuscript':
      return 'рукопись';
    case 'personal_writing':
      return 'личный текст';
    case 'art_project':
      return 'арт-проект';
    case 'biography':
      return 'биография';
    case 'research':
      return 'исследование';
    default:
      return type;
  }
}

export function retrievalStateLabel(outcome: string | null, code: string | null): string {
  if (!outcome) return 'состояние не передано';

  switch (outcome) {
    case 'relevant_results':
      return 'источники найдены';
    case 'weak_match':
      return 'слабое совпадение';
    case 'no_match':
      return 'совпадений нет';
    case 'partial_results':
      return 'частичный результат';
    case 'unavailable':
      if (code === 'timeout' || code === 'embedding_timeout') return 'поиск не ответил вовремя';
      if (code === 'unauthorized_scope') return 'нет доступа к источникам';
      if (code === 'missing_configuration' || code === 'disabled')
        return 'поиск источников не настроен';
      if (code === 'database_unavailable') return 'база источников недоступна';
      return 'поиск недоступен';
    default:
      return outcome;
  }
}

export function totalSourceCount(bundle: SourceBundle): number {
  return bundle.brain.length + bundle.web.length;
}

```

## `lib/pierrot/workspace/citations.ts`

```ts
/**
 * Deterministic inline citation helpers.
 *
 * The backend does not guarantee `[n]` markers. When the model emits them we
 * turn them into clickable badges. When it does not, the UI renders a compact
 * badge cluster at the end of the answer instead of a separate source line.
 */

export const CITATION_HREF_PREFIX = 'pw-cite:';

export function citationIndexFromHref(href: string): number | null {
  if (!href.startsWith(CITATION_HREF_PREFIX)) return null;
  const value = Number(href.slice(CITATION_HREF_PREFIX.length));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function hasCitationMarkers(content: string): boolean {
  return /\[\[?\d{1,3}\]?\]/.test(content);
}

export function prepareCitationMarkdown(content: string, citationCount: number): string {
  if (citationCount <= 0) return content;

  const normalized = content.replace(/\[\[(\d{1,3})\]\]/g, '[$1]');

  return normalized.replace(/\[(\d{1,3})\](?!\()/g, (match, raw: string) => {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 1 || index > citationCount) return match;
    return `[${raw}](${CITATION_HREF_PREFIX}${raw})`;
  });
}

```

## `lib/pierrot/workspace/data.ts`

```ts
import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { loadCommercialSummary } from '@/lib/pierrot/commercialIntelligence';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrainRecentSource,
  OwnerConversation,
  OwnerConversationListItem,
  WorkspaceMetric,
  WorkspaceMetricKey,
  WorkspaceOverview,
  WorkspacePeriod,
} from './types';
import { buildOverviewSummary, classifyMetricState } from './status';

assertServerOnly('lib/pierrot/workspace/data');

const DAY_MS = 24 * 60 * 60 * 1000;

const METRIC_META: Array<{
  key: WorkspaceMetricKey;
  label: string;
  table: string;
  dateColumn: string;
  totalFilter?: (query: any) => any;
  periodFilter?: (query: any) => any;
}> = [
  {
    key: 'users',
    label: 'Пользователи',
    table: 'users',
    dateColumn: 'created_at',
  },
  {
    key: 'subscribers',
    label: 'Подписчики',
    table: 'subscribers',
    dateColumn: 'confirmedAt',
    totalFilter: (query) => query.eq('isActive', true),
    periodFilter: (query) => query.eq('isActive', true),
  },
  {
    key: 'flow',
    label: 'Flow',
    table: 'items',
    dateColumn: 'published_at',
    totalFilter: (query) => query.eq('status', 'published').eq('visibility', 'public'),
    periodFilter: (query) => query.eq('status', 'published').eq('visibility', 'public'),
  },
  {
    key: 'conversations',
    label: 'Диалоги',
    table: 'pierrot_conversations',
    dateColumn: 'started_at',
    totalFilter: (query) => query.or('identity_type.neq.owner,identity_type.is.null'),
    periodFilter: (query) => query.or('identity_type.neq.owner,identity_type.is.null'),
  },
  {
    key: 'media',
    label: 'Медиа',
    table: 'media_archive_records',
    dateColumn: 'created_at',
  },
];

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function isoDay(date: Date): string {
  return date.toISOString();
}

async function readCount(
  store: SupabaseClient,
  table: string,
  configure?: (query: any) => any
): Promise<{ ok: boolean; value: number }> {
  try {
    let query = store.from(table).select('id', { count: 'exact', head: true });
    if (configure) query = configure(query);
    const { count, error } = await query;
    if (error) return { ok: false, value: 0 };
    return { ok: true, value: count ?? 0 };
  } catch {
    return { ok: false, value: 0 };
  }
}

async function readTimestamps(
  store: SupabaseClient,
  table: string,
  column: string,
  from: string,
  to: string,
  configure?: (query: any) => any
): Promise<string[] | null> {
  try {
    let query = store.from(table).select(column).gte(column, from).lte(column, to).limit(10000);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) return null;
    if (!Array.isArray(data)) return null;

    return (data as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const value = row[column];
        return typeof value === 'string' ? value : null;
      })
      .filter((value): value is string => Boolean(value));
  } catch {
    return null;
  }
}

function bucketSeries(
  timestamps: string[],
  periodStart: number,
  period: WorkspacePeriod
): number[] {
  const buckets = Array.from({ length: period }, () => 0);

  for (const value of timestamps) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time) || time < periodStart) continue;
    const index = Math.min(period - 1, Math.floor((time - periodStart) / DAY_MS));
    if (index >= 0) buckets[index] += 1;
  }

  return buckets;
}

async function loadMetric(
  store: SupabaseClient,
  meta: (typeof METRIC_META)[number],
  period: WorkspacePeriod,
  now: Date
): Promise<WorkspaceMetric> {
  const periodStartDate = startOfUtcDay(new Date(now.getTime() - (period - 1) * DAY_MS));
  const previousStartDate = new Date(periodStartDate.getTime() - period * DAY_MS);
  const periodStart = periodStartDate.getTime();

  const [total, timestamps] = await Promise.all([
    readCount(store, meta.table, meta.totalFilter),
    readTimestamps(
      store,
      meta.table,
      meta.dateColumn,
      isoDay(previousStartDate),
      isoDay(now),
      meta.periodFilter
    ),
  ]);

  const series = timestamps ? bucketSeries(timestamps, periodStart, period) : null;
  const periodCount = series ? series.reduce((sum, value) => sum + value, 0) : 0;
  const previousCount = timestamps
    ? timestamps.filter((value) => {
        const time = new Date(value).getTime();
        return Number.isFinite(time) && time >= previousStartDate.getTime() && time < periodStart;
      }).length
    : 0;

  return {
    key: meta.key,
    label: meta.label,
    current: total.value,
    periodCount,
    previousCount,
    state: series ? classifyMetricState(periodCount, previousCount) : null,
    series,
    available: total.ok || series !== null,
  };
}

/**
 * Real snapshot + real daily additions. No metric is synthesized from a
 * single current number: if the date column is unavailable, the series and
 * state stay null and the UI shows "нет данных".
 */
export async function loadWorkspaceOverview(
  period: WorkspacePeriod = 7,
  now = new Date()
): Promise<WorkspaceOverview> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const periodStartDate = startOfUtcDay(new Date(now.getTime() - (period - 1) * DAY_MS));

  const [metrics, commercial] = await Promise.all([
    Promise.all(METRIC_META.map((meta) => loadMetric(store, meta, period, now))),
    loadCommercialSummary({
      store,
      periodKey: period === 30 ? 'last_30_days' : 'last_7_days',
      now,
    }).catch(() =>
      emptyCommercialSummary(period === 30 ? 'last_30_days' : 'last_7_days', now)
    ),
  ]);

  return {
    period,
    from: isoDay(periodStartDate),
    to: isoDay(now),
    metrics,
    commercial,
    summary: buildOverviewSummary(metrics),
    generatedAt: now.toISOString(),
  };
}

function truncateTitle(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 92 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
}

export async function loadOwnerConversations(
  ownerUserId: string,
  limit = 40
): Promise<OwnerConversationListItem[]> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data, error } = await store
      .from('pierrot_conversations')
      .select(
        'id,session_id,started_at,updated_at,last_message_at,consent_state,identity_type,user_id'
      )
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data) || data.length === 0) return [];

    const ids = data
      .map((row) => (typeof row.id === 'string' ? row.id : null))
      .filter((value): value is string => Boolean(value));

    const { data: messageRows } = await store
      .from('pierrot_messages')
      .select('conversation_id,role,content,message_index')
      .in('conversation_id', ids)
      .order('message_index', { ascending: true })
      .limit(3000);

    const firstUserMessage = new Map<string, string>();
    const counts = new Map<string, number>();

    for (const row of Array.isArray(messageRows) ? messageRows : []) {
      const id = typeof row.conversation_id === 'string' ? row.conversation_id : '';
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      if (row.role === 'user' && !firstUserMessage.has(id) && typeof row.content === 'string') {
        firstUserMessage.set(id, truncateTitle(row.content));
      }
    }

    return data
      .filter(
        (row) =>
          typeof row.id === 'string' &&
          typeof row.session_id === 'string' &&
          typeof row.started_at === 'string' &&
          (counts.get(row.id as string) || 0) > 0
      )
      .map((row) => ({
        id: row.id as string,
        sessionId: row.session_id as string,
        title: firstUserMessage.get(row.id as string) || 'Новый диалог',
        startedAt: row.started_at as string,
        updatedAt:
          typeof row.last_message_at === 'string'
            ? row.last_message_at
            : typeof row.updated_at === 'string'
              ? row.updated_at
              : (row.started_at as string),
        consentState:
          row.consent_state === 'granted' || row.consent_state === 'denied'
            ? row.consent_state
            : row.consent_state === 'pending'
              ? 'pending'
              : null,
        messageCount: counts.get(row.id as string) || 0,
      }));
  } catch {
    return [];
  }
}

export async function loadOwnerConversation(
  ownerUserId: string,
  conversationId: string
): Promise<OwnerConversation | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) return null;

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data: conversation, error } = await store
      .from('pierrot_conversations')
      .select('id,session_id,started_at,consent_state,identity_type,user_id')
      .eq('id', conversationId)
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .maybeSingle();

    if (error || !conversation || typeof conversation.session_id !== 'string') return null;

    const { data: rows, error: messagesError } = await store
      .from('pierrot_messages')
      .select('id,role,content,message_index,provider,created_at')
      .eq('conversation_id', conversationId)
      .order('message_index', { ascending: true })
      .limit(500);

    if (messagesError) return null;

    const messages = (Array.isArray(rows) ? rows : [])
      .filter(
        (row): row is {
          id: string;
          role: 'user' | 'assistant';
          content: string;
          message_index: number;
          provider: string | null;
          created_at: string | null;
        } =>
          (row.role === 'user' || row.role === 'assistant') &&
          typeof row.id === 'string' &&
          typeof row.content === 'string'
      )
      .map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: typeof row.created_at === 'string' ? row.created_at : null,
        provider: typeof row.provider === 'string' ? row.provider : null,
      }));

    const firstUser = messages.find((message) => message.role === 'user');

    return {
      id: conversation.id as string,
      sessionId: conversation.session_id,
      title: firstUser ? truncateTitle(firstUser.content) : 'Новый диалог',
      consentState:
        conversation.consent_state === 'granted' || conversation.consent_state === 'denied'
          ? conversation.consent_state
          : conversation.consent_state === 'pending'
            ? 'pending'
            : null,
      messages,
    };
  } catch {
    return null;
  }
}

export async function loadRecentBrainSources(limit = 5): Promise<BrainRecentSource[]> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    let result: any = await store
      .from('brain_ingestion_jobs')
      .select('id,title,source_type,source_format,status,error_code,created_at,document_id')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Older deployments may not have the unified source columns yet.
    if (result.error) {
      result = await store
        .from('brain_ingestion_jobs')
        .select('id,title,status,error_code,created_at,document_id')
        .order('created_at', { ascending: false })
        .limit(limit);
    }

    const data = result.data;
    if (result.error || !Array.isArray(data)) return [];

    return data.map((row) => ({
      id: String(row.id || ''),
      title: typeof row.title === 'string' ? row.title : null,
      sourceType: typeof row.source_type === 'string' ? row.source_type : null,
      sourceFormat: typeof row.source_format === 'string' ? row.source_format : null,
      status: typeof row.status === 'string' ? row.status : null,
      errorCode: typeof row.error_code === 'string' ? row.error_code : null,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
      documentId: typeof row.document_id === 'string' ? row.document_id : null,
    }));
  } catch {
    return [];
  }
}

```

## `lib/pierrot/commercialSummary.ts`

```ts
/**
 * Client-safe commercial summary contracts and deterministic copy.
 *
 * The server loader only counts confirmed purchases, donations and confirmed
 * Flow subscriptions. Interest, checkout starts and shown offers are never
 * treated as revenue.
 */

export type CommercialMoneyTotal = {
  currency: string;
  amountMinor: number;
  count: number;
};

export type CommercialProductSummary = {
  count: number;
  money: CommercialMoneyTotal[];
};

export type CommercialPeriodSummary = {
  paidCount: number;
  money: CommercialMoneyTotal[];
  postcards: CommercialProductSummary;
  unframed: CommercialProductSummary;
  tributes: CommercialProductSummary;
  flowSubscriptions: number;
  purchasesAvailable: boolean;
  donationsAvailable: boolean;
  subscriptionsAvailable: boolean;
};

export type CommercialSummary = {
  periodKey: 'last_7_days' | 'last_30_days';
  periodLabel: string;
  start: string;
  end: string;
  timezone: string;
  current: CommercialPeriodSummary;
  previous: CommercialPeriodSummary;
  overall: {
    postcards: CommercialProductSummary;
    tributes: CommercialProductSummary;
    flowSubscriptions: number;
    postcardsAvailable: boolean;
    tributesAvailable: boolean;
    subscriptionsAvailable: boolean;
  };
  complete: boolean;
  errors: string[];
};

export type CommercialVerdictTone = 'up' | 'flat' | 'down' | 'none' | 'unknown';

export type CommercialVerdict = {
  tone: CommercialVerdictTone;
  headline: string;
  detail: string;
};

export function formatCommercialMoney(totals: CommercialMoneyTotal[]): string {
  if (!Array.isArray(totals) || totals.length === 0) return '';

  return totals
    .map((total) => {
      try {
        return new Intl.NumberFormat('ru-RU', {
          style: 'currency',
          currency: total.currency,
          maximumFractionDigits: 2,
        }).format(total.amountMinor / 100);
      } catch {
        return `${(total.amountMinor / 100).toFixed(2)} ${total.currency}`;
      }
    })
    .join(' + ');
}

export function russianCountLabel(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const value = Math.abs(count);
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${few}`;
  }
  return `${count} ${many}`;
}

export function russianPayments(count: number): string {
  const value = Math.abs(count);
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} подтверждённая оплата`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} подтверждённые оплаты`;
  }
  return `${count} подтверждённых оплат`;
}

export function commercialVerdict(summary: CommercialSummary): CommercialVerdict {
  const current = summary.current;
  const previous = summary.previous;
  const money = formatCommercialMoney(current.money);
  const flow = current.flowSubscriptions;

  const base = [
    current.paidCount > 0 ? russianPayments(current.paidCount) : 'Подтверждённых оплат нет',
    money || (current.paidCount > 0 ? 'сумма не передана' : ''),
    flow > 0 ? `Flow +${flow}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (!summary.complete) {
    return {
      tone: 'unknown',
      headline:
        current.paidCount > 0
          ? 'Частично: есть подтверждённые оплаты.'
          : 'Не знаю: данные неполные.',
      detail:
        current.paidCount > 0
          ? `${base} · данные неполные`
          : 'Часть коммерческих источников недоступна. Ноль не подставляется.',
    };
  }

  if (current.paidCount === 0 && previous.paidCount === 0) {
    return {
      tone: 'none',
      headline: 'Нет, разбогатели не сегодня.',
      detail: base,
    };
  }

  if (current.paidCount === 0) {
    return {
      tone: 'down',
      headline: 'Нет, тише прошлого периода.',
      detail: base,
    };
  }

  if (current.paidCount > previous.paidCount) {
    return {
      tone: 'up',
      headline: 'Да, разбогатели.',
      detail: base,
    };
  }

  if (current.paidCount === previous.paidCount) {
    return {
      tone: 'flat',
      headline: 'Да, но не сильнее прошлого периода.',
      detail: base,
    };
  }

  return {
    tone: 'down',
    headline: 'Нет, меньше прошлого периода.',
    detail: base,
  };
}

export function emptyCommercialPeriod(): CommercialPeriodSummary {
  return {
    paidCount: 0,
    money: [],
    postcards: { count: 0, money: [] },
    unframed: { count: 0, money: [] },
    tributes: { count: 0, money: [] },
    flowSubscriptions: 0,
    purchasesAvailable: false,
    donationsAvailable: false,
    subscriptionsAvailable: false,
  };
}

export function emptyCommercialSummary(
  periodKey: 'last_7_days' | 'last_30_days',
  now = new Date(),
  errors: string[] = ['commercial_summary_unavailable']
): CommercialSummary {
  const period = emptyCommercialPeriod();

  return {
    periodKey,
    periodLabel: periodKey === 'last_7_days' ? '7 дней' : '30 дней',
    start: now.toISOString(),
    end: now.toISOString(),
    timezone: 'Europe/London',
    current: period,
    previous: emptyCommercialPeriod(),
    overall: {
      postcards: { count: 0, money: [] },
      tributes: { count: 0, money: [] },
      flowSubscriptions: 0,
      postcardsAvailable: false,
      tributesAvailable: false,
      subscriptionsAvailable: false,
    },
    complete: false,
    errors,
  };
}

```

## `app/admin/pierrot/(workspace)/workspace.css`

```css
/*
 * Pierrot owner workspace.
 *
 * Fonts: the repository has no self-hosted Newsreader / IBM Plex Mono WOFF2
 * files. Per the brief, no Google Fonts request is made. The tokens below use
 * an editorial serif and system monospace fallback until the WOFF2 files are
 * supplied. Expected future paths: /fonts/newsreader/*.woff2 and
 * /fonts/ibm-plex-mono/*.woff2.
 */

.pw-root {
  --pw-paper: #f8f6f1;
  --pw-panel: #f1eee7;
  --pw-ink: #1d1b18;
  --pw-muted: #6b665e;
  --pw-line: #e3ded3;
  --pw-field-line: #d8d2c6;
  --pw-chip-line: #cfc9bd;
  --pw-white: #ffffff;
  --pw-bubble: #ece7de;
  --pw-ochre: #b7791f;
  --pw-flow: #8a5a10;
  --pw-serif: "Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia,
    "Times New Roman", serif;
  --pw-mono: "IBM Plex Mono", "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace;
  --pw-rail: 88px;
  position: fixed;
  inset: 0;
  display: flex;
  overflow: hidden;
  background: var(--pw-paper);
  color: var(--pw-ink);
  font-family: var(--pw-serif);
  font-size: 18px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overscroll-behavior: none;
}

.pw-root *,
.pw-root *::before,
.pw-root *::after {
  box-sizing: border-box;
}

.pw-root :focus-visible {
  outline: 2px solid var(--pw-ink);
  outline-offset: 3px;
}

.pw-root button,
.pw-root input,
.pw-root textarea,
.pw-root select {
  color: inherit;
}

.pw-root a {
  color: inherit;
}

.pw-root button {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  touch-action: manipulation;
}

.pw-root button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.pw-root a {
  color: inherit;
  text-decoration: none;
}

.pw-root input,
.pw-root textarea,
.pw-root select {
  background: var(--pw-white);
  border: 1px solid var(--pw-field-line);
}

.pw-root ::placeholder {
  color: #8b857c;
  opacity: 1;
}

.pw-root ::selection {
  background: #e7dfd0;
}

/* ---------------- Rail ---------------- */

.pw-rail {
  position: relative;
  z-index: 30;
  display: flex;
  flex: 0 0 var(--pw-rail);
  flex-direction: column;
  width: var(--pw-rail);
  height: 100%;
  padding-top: max(14px, env(safe-area-inset-top));
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: var(--pw-panel);
  border-right: 1px solid var(--pw-line);
}

.pw-rail-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 56px;
  margin-bottom: 22px;
  font-family: var(--pw-serif);
  font-size: 22px;
  letter-spacing: -0.03em;
}

.pw-rail-brand .pw-avatar-badge {
  width: 32px;
  height: 32px;
}

.pw-rail-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.pw-rail-link {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 68px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
  transition: color 120ms ease;
}

.pw-rail-link:hover {
  color: var(--pw-ink);
}

.pw-rail-link[aria-current="page"] {
  color: var(--pw-ink);
}

.pw-rail-link[aria-current="page"]::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 2px;
  background: var(--pw-ink);
}

.pw-rail-spacer {
  flex: 1;
}

/* ---------------- Main surfaces ---------------- */

.pw-main {
  flex: 1;
  min-width: 0;
  height: 100dvh;
  overflow: hidden;
}

.pw-page {
  height: 100%;
  overflow-y: auto;
  padding:
    max(36px, env(safe-area-inset-top))
    clamp(20px, 4vw, 56px)
    max(48px, env(safe-area-inset-bottom));
  overscroll-behavior: contain;
}

.pw-page-inner {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.pw-kicker {
  margin: 0;
  font-family: var(--pw-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  line-height: 1.4;
  text-transform: uppercase;
  color: var(--pw-muted);
}

.pw-page-title {
  margin: 14px 0 0;
  font-family: var(--pw-serif);
  font-size: clamp(38px, 4.6vw, 44px);
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 1.02;
}

.pw-page-lede {
  max-width: 38em;
  margin: 18px 0 0;
  color: var(--pw-muted);
  font-size: 20px;
  line-height: 1.45;
}

.pw-section-title {
  margin: 0;
  font-family: var(--pw-mono);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.12em;
  line-height: 1.4;
  text-transform: uppercase;
  color: var(--pw-muted);
}

.pw-rule {
  height: 1px;
  margin: 32px 0;
  background: var(--pw-line);
}

/* ---------------- Chat ---------------- */

.pw-chat {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.pw-drawer,
.pw-inspector {
  width: 0;
  flex: 0 0 0;
  overflow: hidden;
  background: var(--pw-paper);
}

.pw-drawer {
  border-right: 1px solid var(--pw-line);
  background: var(--pw-panel);
}

.pw-inspector {
  border-left: 1px solid var(--pw-line);
}

.pw-chat[data-drawer="open"] .pw-drawer {
  width: 288px;
  flex-basis: 288px;
}

.pw-chat[data-inspector="open"] .pw-inspector {
  width: 300px;
  flex-basis: 300px;
}

.pw-drawer-inner,
.pw-inspector-inner {
  display: flex;
  flex-direction: column;
  width: 288px;
  height: 100%;
  min-height: 0;
}

.pw-inspector-inner {
  width: 300px;
}

.pw-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 64px;
  padding: max(8px, env(safe-area-inset-top)) 16px 8px;
  border-bottom: 1px solid var(--pw-line);
}

.pw-icon-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  color: var(--pw-muted);
  transition: color 120ms ease;
}

.pw-icon-button:hover {
  color: var(--pw-ink);
}

.pw-drawer-scroll,
.pw-inspector-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pw-new-chat {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 0 18px;
  border-bottom: 1px solid var(--pw-line);
  color: var(--pw-ink);
  font-family: var(--pw-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
}

.pw-new-chat:hover {
  background: var(--pw-paper);
}

.pw-conversation-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pw-conversation-link {
  display: block;
  width: 100%;
  min-height: 64px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--pw-line);
  text-align: left;
}

.pw-conversation-link:hover {
  background: var(--pw-paper);
}

.pw-conversation-link[aria-current="page"] {
  background: var(--pw-paper);
  box-shadow: inset 2px 0 0 var(--pw-ink);
}

.pw-conversation-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-family: var(--pw-serif);
  font-size: 16px;
  line-height: 1.3;
}

.pw-conversation-date {
  display: block;
  margin-top: 6px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pw-drawer-empty {
  padding: 20px 18px;
  color: var(--pw-muted);
  font-size: 15px;
  line-height: 1.45;
}

.pw-center {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--pw-paper);
}

.pw-chat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: calc(64px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 20px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-chat-head-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-family: var(--pw-serif);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pw-chat-head-dialog {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--pw-line);
  border-radius: 50%;
  color: var(--pw-muted);
}

.pw-chat-head-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.pw-chat-head-sub {
  margin-top: 1px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
  line-height: 1.3;
  text-transform: uppercase;
}

.pw-chat-head-meta {
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pw-avatar-badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--pw-line);
  border-radius: 50%;
  background: var(--pw-panel);
}

.pw-avatar-badge img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pw-avatar-fallback {
  color: var(--pw-muted);
  font-family: var(--pw-serif);
  font-size: 0.82em;
  line-height: 1;
}

.pw-chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pw-chat-thread {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 34px 28px 48px;
}

.pw-empty {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: clamp(28px, 6vh, 64px) 28px 40px;
}

.pw-empty-title {
  margin: 0;
  font-family: var(--pw-serif);
  font-size: clamp(44px, 5vw, 56px);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
}

.pw-empty-summary {
  max-width: 32em;
  margin: 22px 0 0;
  color: var(--pw-muted);
  font-size: 23px;
  line-height: 1.4;
}

.pw-status-list {
  margin: 40px 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--pw-line);
}

.pw-empty .pw-status-list {
  margin-top: 28px;
}

.pw-status-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 8px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-status-label {
  font-family: var(--pw-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pw-muted);
}

.pw-status-word {
  font-family: var(--pw-serif);
  font-size: 22px;
  line-height: 1.2;
}

.pw-status-missing {
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pw-muted);
}

.pw-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.pw-dot-growth {
  background: var(--pw-ink);
}

.pw-dot-attention {
  background: var(--pw-ochre);
}

.pw-dot-neutral {
  border: 1px solid #9a948a;
  background: transparent;
}

.pw-dot-missing {
  border: 1px dashed #a9a298;
  border-radius: 1px;
  background: transparent;
}

/* ---------------- Messages ---------------- */

.pw-message {
  margin: 0 0 30px;
}

.pw-message:last-child {
  margin-bottom: 0;
}

.pw-message-user {
  display: flex;
  justify-content: flex-end;
}

.pw-bubble-user {
  max-width: 86%;
  padding: 13px 18px;
  border-radius: 18px 18px 4px 18px;
  background: var(--pw-bubble);
  font-size: 19px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pw-message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  margin-bottom: 6px;
}

.pw-message-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pw-message-label {
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pw-muted);
}

.pw-message-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  margin: -8px -10px -8px 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 15px;
  letter-spacing: 0.1em;
}

.pw-message-menu:hover,
.pw-message-menu[aria-expanded="true"] {
  color: var(--pw-ink);
}

.pw-message-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0 18px;
  margin: -2px 0 10px;
  padding: 6px 0;
  border-top: 1px solid var(--pw-line);
  border-bottom: 1px solid var(--pw-line);
}

.pw-message-actions button {
  min-height: 44px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pw-message-actions button:hover {
  color: var(--pw-ink);
}

.pw-reply {
  font-size: 23px;
  line-height: 1.55;
  letter-spacing: -0.004em;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.pw-reply p {
  text-wrap: pretty;
}

.pw-reply > :first-child {
  margin-top: 0;
}

.pw-reply > :last-child {
  margin-bottom: 0;
}

.pw-reply p,
.pw-reply ul,
.pw-reply ol,
.pw-reply blockquote,
.pw-reply pre,
.pw-reply table {
  margin: 0 0 0.85em;
}

.pw-reply ul,
.pw-reply ol {
  padding-left: 1.25em;
}

.pw-reply li {
  margin: 0.2em 0;
}

.pw-reply a {
  color: var(--pw-flow);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.pw-reply strong {
  font-weight: 500;
}

.pw-reply blockquote {
  padding-left: 16px;
  border-left: 1px solid var(--pw-chip-line);
  color: var(--pw-muted);
}

.pw-reply code {
  padding: 0.08em 0.32em;
  background: var(--pw-panel);
  font-family: var(--pw-mono);
  font-size: 0.78em;
}

.pw-reply pre {
  overflow-x: auto;
  padding: 14px 16px;
  border: 1px solid var(--pw-line);
  background: var(--pw-panel);
}

.pw-reply pre code {
  padding: 0;
  background: transparent;
}

.pw-reply table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}

.pw-reply th,
.pw-reply td {
  padding: 8px 10px;
  border: 1px solid var(--pw-line);
  text-align: left;
}

/* Inline citations */
.pw-root .pw-cite {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0 4px;
  margin: 0 2px;
  border: 1px solid var(--pw-chip-line);
  border-radius: 999px;
  background: var(--pw-paper);
  color: var(--pw-flow);
  font-family: var(--pw-mono);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1;
  text-decoration: none;
  vertical-align: super;
}

.pw-root .pw-cite::after {
  content: "";
  position: absolute;
  inset: -8px;
}

.pw-root .pw-cite:hover {
  border-color: var(--pw-flow);
  background: var(--pw-white);
}

.pw-citations {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.pw-citations .pw-cite {
  vertical-align: baseline;
}

.pw-message-note {
  margin-top: 14px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-message-error {
  padding: 12px 14px;
  border: 1px solid var(--pw-chip-line);
  color: var(--pw-flow);
  font-size: 16px;
  line-height: 1.45;
}

.pw-feedback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  margin-top: 14px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-feedback-label {
  margin-right: 4px;
  font-family: var(--pw-serif);
  font-size: 14px;
  letter-spacing: 0;
  text-transform: none;
}

.pw-feedback-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  line-height: 1;
  text-transform: uppercase;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}

.pw-feedback-button:hover:not(:disabled) {
  border-color: var(--pw-chip-line);
  background: var(--pw-white);
  color: var(--pw-ink);
}

.pw-feedback-button[aria-pressed="true"] {
  border-color: var(--pw-chip-line);
  background: var(--pw-panel);
  color: var(--pw-ink);
}

.pw-feedback-button:disabled {
  opacity: 0.62;
}

.pw-feedback-button[aria-pressed="true"]:disabled {
  opacity: 1;
}

.pw-feedback-sep {
  color: var(--pw-chip-line);
}

.pw-feedback-error {
  margin-left: 4px;
  color: var(--pw-flow);
  letter-spacing: 0.03em;
  text-transform: none;
}

.pw-typing {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pw-typing span {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--pw-ochre);
}

/* ---------------- Composer ---------------- */

.pw-composer-wrap {
  flex: 0 0 auto;
  padding: 12px 28px max(14px, env(safe-area-inset-bottom));
  background: var(--pw-paper);
}

.pw-composer-inner {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 7px 7px 7px 4px;
  border: 1px solid var(--pw-field-line);
  border-radius: 28px;
  background: var(--pw-white);
  transition: border-color 120ms ease;
}

.pw-composer-inner:focus-within {
  border-color: var(--pw-ink);
}

.pw-root .pw-composer-input {
  display: block;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  max-height: 168px;
  padding: 9px 6px 9px 18px;
  overflow-y: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-family: var(--pw-serif);
  font-size: 19px;
  line-height: 1.35;
  resize: none;
}

.pw-root .pw-composer-input:focus {
  outline: none;
}

.pw-root .pw-send {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  margin: 0 2px 2px 0;
  border-radius: 50%;
  background: var(--pw-ink);
  color: var(--pw-paper);
}

.pw-root .pw-send:hover:not(:disabled) {
  background: #000;
}

.pw-composer-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 16px;
  width: 100%;
  max-width: 640px;
  margin: 8px auto 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-link-button {
  display: inline;
  min-height: 32px;
  color: var(--pw-flow);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-transform: uppercase;
}

/* ---------------- Inspector ---------------- */

.pw-inspector-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-height: 64px;
  padding: max(12px, env(safe-area-inset-top)) 14px 12px 18px;
  border-bottom: 1px solid var(--pw-line);
}

.pw-inspector-title {
  margin: 4px 0 0;
  font-family: var(--pw-serif);
  font-size: 19px;
  font-weight: 400;
  line-height: 1.2;
}

.pw-inspector-section {
  padding: 18px;
  border-bottom: 1px solid var(--pw-line);
}

.pw-inspector-source {
  padding: 16px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-inspector-source:first-child {
  padding-top: 0;
}

.pw-inspector-source:last-child {
  border-bottom: 0;
}

.pw-inspector-source.is-active {
  padding-right: 12px;
  padding-left: 12px;
  background: var(--pw-panel);
  box-shadow: inset 2px 0 0 var(--pw-ink);
}

.pw-inspector-source {
  scroll-margin-top: 8px;
}

.pw-source-type {
  display: inline-block;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pw-source-title {
  margin: 6px 0 0;
  font-family: var(--pw-serif);
  font-size: 18px;
  font-weight: 400;
  line-height: 1.3;
}

.pw-source-meta {
  margin: 6px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-source-excerpt {
  margin: 8px 0 0;
  color: var(--pw-muted);
  font-size: 14px;
  line-height: 1.45;
}

.pw-source-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--pw-flow);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pw-inspector-empty {
  padding: 24px 18px;
  color: var(--pw-muted);
  font-size: 15px;
  line-height: 1.5;
}

/* ---------------- Scrim / sheets ---------------- */

.pw-scrim {
  display: none;
}

@media (max-width: 1099px) {
  .pw-chat[data-drawer="open"] .pw-drawer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    width: min(320px, calc(100vw - 48px));
    flex-basis: auto;
  }

  .pw-chat[data-inspector="open"] .pw-inspector {
    position: absolute;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 25;
    width: 100%;
    max-height: min(72dvh, 640px);
    flex-basis: auto;
    border-top: 1px solid var(--pw-line);
    border-left: 0;
  }

  .pw-chat[data-inspector="open"] .pw-inspector-inner {
    width: 100%;
    height: auto;
    max-height: min(72dvh, 640px);
  }

  .pw-chat[data-inspector="open"] .pw-inspector-scroll {
    max-height: calc(min(72dvh, 640px) - 64px);
  }

  .pw-drawer-inner,
  .pw-inspector-inner {
    width: 100%;
  }

  .pw-scrim {
    position: absolute;
    inset: 0;
    z-index: 15;
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: rgba(29, 27, 24, 0.18);
  }
}

/* ---------------- DASH (compact owner dashboard) ---------------- */

.pw-dash {
  padding-top: max(26px, env(safe-area-inset-top));
}

.pw-dash-inner {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.pw-dash-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 22px;
}

.pw-dash-title {
  margin: 8px 0 0;
  font-family: var(--pw-serif);
  font-size: clamp(36px, 4.4vw, 44px);
  font-weight: 400;
  letter-spacing: -0.028em;
  line-height: 1;
}

.pw-dash-summary {
  max-width: 46em;
  margin: 12px 0 0;
  color: var(--pw-muted);
  font-size: 18px;
  line-height: 1.45;
}

.pw-dash .pw-segmented {
  margin-top: 4px;
}

.pw-dash-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 24px;
  border-top: 1px solid var(--pw-line);
  border-bottom: 1px solid var(--pw-line);
}

.pw-dash-metric {
  min-width: 0;
  padding: 13px 14px 12px;
  border-left: 1px solid var(--pw-line);
}

.pw-dash-metric:first-child {
  padding-left: 0;
  border-left: 0;
}

.pw-dash-metric-label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8px;
  letter-spacing: 0.08em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-dash-metric-label .pw-dot {
  width: 6px;
  height: 6px;
}

.pw-dash-number {
  margin-top: 8px;
  font-family: var(--pw-serif);
  font-size: 34px;
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 1;
}

.pw-dash-state {
  margin-top: 4px;
  color: var(--pw-muted);
  font-family: var(--pw-serif);
  font-size: 15px;
  line-height: 1.2;
}

.pw-dash-metric .pw-spark {
  width: 100%;
  max-width: none;
  margin-top: 4px;
}

.pw-dash-metric .pw-spark svg {
  height: 26px;
}

.pw-dash-metric-sub {
  margin: 4px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 7.5px;
  letter-spacing: 0.05em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-dash-commercial {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 26px;
  align-items: start;
  margin-top: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--pw-line);
}

.pw-dash-verdict {
  margin: 6px 0 0;
  font-family: var(--pw-serif);
  font-size: 25px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.pw-dash-verdict.pw-commercial-down,
.pw-dash-verdict.pw-commercial-unknown {
  color: var(--pw-flow);
}

.pw-dash-detail {
  margin: 5px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8.5px;
  letter-spacing: 0.06em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-dash-checkout {
  margin: 6px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8.5px;
  letter-spacing: 0.04em;
  line-height: 1.5;
}

.pw-dash-money {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 150px;
  text-align: right;
}

.pw-dash-money strong {
  font-family: var(--pw-serif);
  font-size: 27px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1;
}

.pw-dash-products {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 8px;
  border-top: 1px solid var(--pw-line);
}

.pw-dash-products > div {
  min-width: 0;
  padding: 9px 14px;
  border-left: 1px solid var(--pw-line);
}

.pw-dash-products > div:first-child {
  padding-left: 0;
  border-left: 0;
}

.pw-dash-products span {
  display: block;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 7.5px;
  letter-spacing: 0.08em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-dash-products strong {
  display: block;
  margin-top: 3px;
  font-family: var(--pw-serif);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.2;
}

.pw-dash-products em {
  display: block;
  margin-top: 2px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8px;
  font-style: normal;
  letter-spacing: 0.04em;
  line-height: 1.4;
}

.pw-dash-partial {
  grid-column: 1 / -1;
  margin: 8px 0 0;
  color: var(--pw-flow);
  font-family: var(--pw-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
  line-height: 1.5;
}

.pw-dash-panels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 30px;
  margin-top: 20px;
}

.pw-dash-panel {
  min-width: 0;
  padding-top: 10px;
  border-top: 1px solid var(--pw-line);
}

.pw-dash-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.pw-dash-panel-head h2 {
  margin: 0;
  font-family: var(--pw-mono);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.12em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-dash-panel-head span {
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8px;
  letter-spacing: 0.06em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-dash-rows {
  display: flex;
  flex-direction: column;
}

.pw-dash-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-height: 25px;
  padding: 4px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-dash-row span {
  overflow: hidden;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8px;
  letter-spacing: 0.06em;
  line-height: 1.4;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.pw-dash-row strong {
  flex: 0 0 auto;
  font-family: var(--pw-serif);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
}

.pw-dash-missing {
  margin: 10px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
  line-height: 1.5;
}

.pw-dash-foot {
  margin: 18px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
  line-height: 1.55;
}

/* ---------------- DASH ---------------- */

.pw-segmented {
  display: inline-flex;
  margin-top: 24px;
  border: 1px solid var(--pw-chip-line);
}

.pw-segmented a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  white-space: nowrap;
  min-height: 44px;
  padding: 0 14px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pw-segmented a + a {
  border-left: 1px solid var(--pw-chip-line);
}

.pw-segmented a[aria-current="page"] {
  background: var(--pw-ink);
  color: var(--pw-paper);
}

.pw-metrics {
  margin-top: 36px;
  border-top: 1px solid var(--pw-line);
}

.pw-metric-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.9fr) minmax(120px, 0.8fr) minmax(120px, 1fr);
  align-items: center;
  gap: 24px;
  min-height: 104px;
  padding: 20px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-metric-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--pw-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pw-metric-state {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  margin-top: 8px;
  color: var(--pw-muted);
  font-family: var(--pw-serif);
  font-size: 18px;
}

.pw-metric-state .pw-dot {
  flex: 0 0 auto;
}

.pw-metric-number {
  font-family: var(--pw-serif);
  font-size: 40px;
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 1;
}

.pw-metric-sub {
  margin: 8px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-spark {
  justify-self: end;
  width: 100%;
  max-width: 180px;
  color: var(--pw-ink);
}

.pw-spark svg {
  display: block;
  width: 100%;
  height: 42px;
  overflow: visible;
}

.pw-spark-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.pw-spark-area {
  fill: var(--pw-panel);
  stroke: none;
}

.pw-spark-empty {
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-align: right;
  text-transform: uppercase;
}

.pw-commercial-brief {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid var(--pw-line);
}

.pw-commercial-brief-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.pw-commercial-link {
  color: var(--pw-flow);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pw-commercial-verdict {
  margin: 12px 0 0;
  font-family: var(--pw-serif);
  font-size: 27px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.pw-commercial-down .pw-commercial-verdict,
.pw-commercial-unknown .pw-commercial-verdict {
  color: var(--pw-flow);
}

.pw-commercial-detail {
  margin: 8px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  line-height: 1.55;
  text-transform: uppercase;
}

.pw-commercial-partial {
  margin: 10px 0 0;
  color: var(--pw-flow);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  line-height: 1.5;
}

.pw-commercial {
  margin-top: 48px;
  padding-top: 26px;
  border-top: 1px solid var(--pw-line);
}

.pw-commercial-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px 32px;
}

.pw-commercial .pw-commercial-verdict {
  font-size: 30px;
}

.pw-commercial-total {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  text-align: right;
}

.pw-commercial-total strong {
  font-family: var(--pw-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.pw-commercial-products {
  margin-top: 22px;
  border-top: 1px solid var(--pw-line);
}

.pw-commercial-product {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(90px, auto);
  align-items: baseline;
  gap: 18px;
  min-height: 48px;
  padding: 10px 0;
  border-bottom: 1px solid var(--pw-line);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pw-commercial-product strong {
  font-family: var(--pw-serif);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.01em;
  text-transform: none;
}

.pw-commercial-product-money {
  color: var(--pw-muted);
  font-size: 9px;
  text-align: right;
}

.pw-commercial-overall {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  margin-top: 18px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  line-height: 1.6;
  text-transform: uppercase;
}

.pw-commercial-foot {
  max-width: 62em;
  margin: 16px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  line-height: 1.65;
}

/* ---------------- FLOW (site parity) ---------------- */

.pw-flow-site {
  height: 100%;
  overflow-y: auto;
  background: #ffffff;
  color: #171717;
  overscroll-behavior: contain;
}

.pw-flow-site-inner {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding:
    max(34px, env(safe-area-inset-top))
    clamp(20px, 4vw, 40px)
    max(112px, env(safe-area-inset-bottom));
}

.pw-flow-publish {
  position: fixed;
  right: max(22px, env(safe-area-inset-right));
  bottom: max(22px, env(safe-area-inset-bottom));
  z-index: 35;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid var(--pw-flow);
  background: var(--pw-flow);
  color: var(--pw-paper);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  line-height: 1;
  text-transform: uppercase;
}

.pw-flow-publish:hover:not(:disabled) {
  border-color: #6f480b;
  background: #6f480b;
}

.pw-site-feed {
  margin-top: 18px;
}

.pw-site-entry {
  padding: 30px 0;
  border-bottom: 1px solid #f0eeea;
}

.pw-site-entry:last-child {
  border-bottom: 0;
}

.pw-site-entry-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #a3a3a3;
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-site-entry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.pw-site-entry-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  padding: 0 8px;
  color: #a3a3a3;
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pw-site-entry-actions button:hover:not(:disabled) {
  color: #171717;
}

.pw-site-entry-title {
  margin: 0 0 8px;
  font-family: var(--pw-serif);
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.pw-site-entry-title a:hover {
  color: #525252;
}

.pw-site-entry-body {
  display: block;
  color: #262626;
}

.pw-site-entry-body p {
  margin: 0;
  font-family: var(--pw-serif);
  font-size: 17px;
  line-height: 1.7;
  white-space: pre-line;
}

.pw-site-entry-more {
  display: inline-block;
  margin-top: 8px;
  color: #a3a3a3;
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pw-site-entry-more:hover {
  color: #171717;
}

.pw-site-entry-image {
  display: block;
  margin-top: 16px;
  border: 1px solid #f0eeea;
  overflow: hidden;
}

.pw-site-entry-image img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
}

.pw-site-entry-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  padding: 13px 14px;
  border: 1px solid #ebe7e1;
  background: #faf9f7;
}

.pw-site-entry-link span {
  color: #232323;
  font-family: var(--pw-serif);
  font-size: 15px;
  line-height: 1.35;
}

.pw-site-entry-link small {
  color: #737373;
  font-family: var(--pw-serif);
  font-size: 12px;
  line-height: 1.45;
}

.pw-site-entry-link em {
  color: #a3a3a3;
  font-family: var(--pw-mono);
  font-size: 9px;
  font-style: normal;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pw-site-entry-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.pw-site-entry-footer a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #a3a3a3;
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pw-site-entry-footer a:hover {
  color: #171717;
}

.pw-flow-loading {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 34px 0;
}

.pw-flow-loading span {
  display: block;
  height: 0.75rem;
  background: #f5f3ef;
}

.pw-flow-loading span:nth-child(1) { width: 30%; }
.pw-flow-loading span:nth-child(2) { width: 72%; }
.pw-flow-loading span:nth-child(3) { width: 48%; }

.pw-flow-empty {
  padding: 48px 0;
  color: #8b857c;
  text-align: left;
}

.pw-flow-empty p {
  margin: 0;
  font-family: var(--pw-serif);
  font-size: 20px;
}

/* ---------------- FLOW ---------------- */

.pw-flow-band {
  position: fixed;
  top: 0;
  right: 0;
  left: var(--pw-rail);
  z-index: 25;
  height: 4px;
  background: var(--pw-ochre);
}

.pw-flow-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.82fr);
  gap: 36px;
  align-items: start;
  margin-top: 32px;
}

.pw-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.pw-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  line-height: 1.4;
  text-transform: uppercase;
}

.pw-input {
  width: 100%;
  min-height: 48px;
  padding: 11px 14px;
  border: 1px solid var(--pw-field-line);
  border-radius: 0;
  background: var(--pw-white);
  font-family: var(--pw-serif);
  font-size: 20px;
  letter-spacing: 0;
  line-height: 1.4;
  text-transform: none;
}

.pw-textarea {
  width: 100%;
  min-height: 240px;
  padding: 16px 18px;
  border: 1px solid var(--pw-field-line);
  border-radius: 0;
  background: var(--pw-white);
  font-family: var(--pw-serif);
  font-size: 21px;
  letter-spacing: 0;
  line-height: 1.5;
  text-transform: none;
  resize: vertical;
}

.pw-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pw-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--pw-chip-line);
  border-radius: 999px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pw-chip[aria-pressed="true"],
.pw-chip-active {
  background: var(--pw-ink);
  border-color: var(--pw-ink);
  color: var(--pw-paper);
}

.pw-chip:disabled {
  opacity: 0.55;
}

.pw-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--pw-chip-line);
  color: var(--pw-ink);
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  line-height: 1.2;
  text-transform: uppercase;
}

.pw-button:hover:not(:disabled) {
  border-color: var(--pw-ink);
}

.pw-button-primary {
  border-color: var(--pw-flow);
  background: var(--pw-flow);
  color: var(--pw-paper);
}

.pw-button-primary:hover:not(:disabled) {
  border-color: #6f480b;
  background: #6f480b;
}

.pw-button-danger {
  border-color: #c7a9a6;
  color: #7d3c34;
}

.pw-button-small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 9px;
}

.pw-preview {
  position: sticky;
  top: 0;
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--pw-line);
  background: var(--pw-white);
}

.pw-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--pw-line);
}

.pw-preview-title {
  margin: 20px 0 0;
  font-family: var(--pw-serif);
  font-size: 30px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.pw-preview-body {
  margin-top: 12px;
  color: #37332d;
  font-size: 17px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.pw-preview-body > :first-child {
  margin-top: 0;
}

.pw-preview-body > :last-child {
  margin-bottom: 0;
}

.pw-preview-body p,
.pw-preview-body ul,
.pw-preview-body ol,
.pw-preview-body blockquote {
  margin: 0 0 0.75em;
}

.pw-preview-body a {
  color: var(--pw-flow);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pw-preview-meta {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--pw-line);
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-channel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
  padding: 8px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-channel-name {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-family: var(--pw-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pw-channel-state {
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-align: right;
  text-transform: uppercase;
}

.pw-undo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid var(--pw-ochre);
  background: #fbf6ec;
}

.pw-undo-text {
  font-size: 16px;
  line-height: 1.4;
}

.pw-undo-count {
  font-family: var(--pw-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
}

.pw-flow-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--pw-line);
}

.pw-flow-item {
  padding: 18px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-flow-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
}

.pw-flow-item-title {
  margin: 0;
  font-family: var(--pw-serif);
  font-size: 21px;
  font-weight: 400;
  line-height: 1.3;
}

.pw-flow-item-meta {
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.6;
  text-transform: uppercase;
}

.pw-flow-item-excerpt {
  margin: 8px 0 0;
  color: var(--pw-muted);
  font-size: 15px;
  line-height: 1.45;
}

.pw-flow-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* ---------------- BRAIN ---------------- */

.pw-brain-form {
  max-width: 760px;
  margin-top: 30px;
}

.pw-dropzone {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 120px;
  padding: 20px;
  border: 1px dashed var(--pw-chip-line);
  background: var(--pw-white);
  text-align: left;
}

.pw-dropzone:hover,
.pw-dropzone[data-dragging="true"] {
  border-color: var(--pw-ink);
}

.pw-dropzone-hint {
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-preview-card {
  margin-top: 22px;
  padding: 20px;
  border: 1px solid var(--pw-line);
  background: var(--pw-white);
}

.pw-preview-card-title {
  margin: 8px 0 0;
  font-family: var(--pw-serif);
  font-size: 24px;
  font-weight: 400;
  line-height: 1.25;
}

.pw-preview-card-meta {
  margin: 8px 0 0;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.6;
  text-transform: uppercase;
}

.pw-preview-excerpt {
  max-height: 220px;
  margin: 14px 0 0;
  overflow-y: auto;
  color: var(--pw-muted);
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.pw-tag-input {
  width: min(100%, 360px);
  min-height: 38px;
  padding: 6px 12px;
  border: 1px solid var(--pw-chip-line);
  border-radius: 999px;
  background: var(--pw-white);
  font-family: var(--pw-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.pw-recent {
  margin-top: 42px;
  max-width: 900px;
}

.pw-recent-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--pw-line);
}

.pw-recent-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 18px;
  padding: 14px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-recent-title {
  overflow: hidden;
  font-size: 17px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pw-recent-meta {
  margin-top: 4px;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
}

.pw-recent-status {
  align-self: start;
  color: var(--pw-muted);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-align: right;
  text-transform: uppercase;
}

.pw-notice {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--pw-line);
  color: var(--pw-muted);
  font-size: 15px;
  line-height: 1.5;
}

.pw-notice-warning {
  border-color: var(--pw-ochre);
  color: var(--pw-flow);
}

.pw-media-local {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--pw-line);
  background: var(--pw-white);
}

.pw-media-local img,
.pw-media-local audio {
  display: block;
  max-width: 100%;
  margin-top: 10px;
}

/* ---------------- SETTINGS ---------------- */

.pw-settings {
  max-width: 760px;
}

.pw-setting-group {
  margin-top: 40px;
}

.pw-setting-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.7fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 64px;
  padding: 12px 0;
  border-bottom: 1px solid var(--pw-line);
}

.pw-setting-name {
  font-family: var(--pw-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.pw-setting-value {
  color: var(--pw-muted);
  font-size: 16px;
  line-height: 1.45;
}

.pw-setting-value strong {
  color: var(--pw-ink);
  font-weight: 400;
}

.pw-account {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pw-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--pw-line);
  border-radius: 50%;
  background: var(--pw-panel);
  font-family: var(--pw-serif);
  font-size: 20px;
}

.pw-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pw-shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0 24px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.pw-shortcuts li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  border-bottom: 1px solid var(--pw-line);
}

.pw-shortcuts span:first-child {
  color: var(--pw-muted);
  font-size: 15px;
}

.pw-kbd {
  padding: 3px 7px;
  border: 1px solid var(--pw-chip-line);
  font-family: var(--pw-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

/* ---------------- Responsive ---------------- */

@media (max-width: 1099px) {
  .pw-dash-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pw-dash-metric:nth-child(4) {
    border-left: 0;
  }

  .pw-dash-metric:nth-child(n + 4) {
    border-top: 1px solid var(--pw-line);
  }

  .pw-dash-metric:last-child {
    grid-column: span 2;
  }

  .pw-dash-panels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pw-dash-panel:last-child {
    grid-column: 1 / -1;
  }

  .pw-dash-commercial {
    grid-template-columns: minmax(0, 1fr);
  }

  .pw-dash-money {
    align-items: flex-start;
    text-align: left;
  }

  .pw-dash-products {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pw-dash-products > div:nth-child(3) {
    padding-left: 0;
    border-left: 0;
  }

  .pw-dash-products > div:nth-child(n + 3) {
    border-top: 1px solid var(--pw-line);
  }

  .pw-flow-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .pw-preview {
    position: static;
  }
}

@media (max-width: 760px) {
  .pw-metric-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .pw-spark {
    grid-column: 1 / -1;
    justify-self: stretch;
    max-width: none;
  }

  .pw-setting-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 16px 0;
  }

  .pw-setting-row > :last-child {
    justify-self: start;
  }
}

@media (max-width: 699px) {
  .pw-root {
    display: block;
  }

  .pw-rail {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    display: flex;
    flex-direction: row;
    width: auto;
    height: calc(62px + env(safe-area-inset-bottom));
    padding: 0 max(env(safe-area-inset-right), 4px) env(safe-area-inset-bottom)
      max(env(safe-area-inset-left), 4px);
    border-top: 1px solid var(--pw-line);
    border-right: 0;
  }

  .pw-rail-brand,
  .pw-rail-spacer {
    display: none;
  }

  .pw-rail-brand .pw-avatar-badge {
  width: 32px;
  height: 32px;
}

.pw-rail-list {
    flex-direction: row;
    gap: 0;
  }

  .pw-rail-link {
    flex: 1;
    min-width: 0;
    min-height: 56px;
    gap: 6px;
    font-size: 9px;
  }

  .pw-rail-link[aria-current="page"]::before {
    top: 0;
    right: 12px;
    bottom: auto;
    left: 12px;
    width: auto;
    height: 2px;
  }

  .pw-main {
    height: calc(100dvh - 62px - env(safe-area-inset-bottom));
    padding-bottom: 0;
  }

  .pw-flow-band {
    left: 0;
  }

  .pw-page {
    padding:
      max(26px, env(safe-area-inset-top))
      18px
      32px;
  }

  .pw-dash-head {
    display: block;
  }

  .pw-dash .pw-segmented {
    margin-top: 16px;
  }

  .pw-dash-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pw-dash-metric:nth-child(n + 3) {
    border-top: 1px solid var(--pw-line);
  }

  .pw-dash-metric:nth-child(odd) {
    padding-left: 0;
    border-left: 0;
  }

  .pw-dash-metric:nth-child(even) {
    padding-left: 14px;
    border-left: 1px solid var(--pw-line);
  }

  .pw-dash-panels {
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
  }

  .pw-dash-panel:last-child {
    grid-column: auto;
  }

  .pw-dash-products {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .pw-page-title {
    font-size: 38px;
  }

  .pw-page-lede {
    font-size: 18px;
  }

  .pw-chat-head {
    min-height: calc(56px + env(safe-area-inset-top));
    padding-right: 12px;
    padding-left: 8px;
  }

  .pw-chat-head-sub {
    display: none;
  }

  .pw-chat-thread,
  .pw-empty {
    padding-right: 18px;
    padding-left: 18px;
  }

  .pw-chat-thread {
    padding-top: 24px;
  }

  .pw-empty-title {
    font-size: 44px;
  }

  .pw-empty-summary {
    font-size: 20px;
  }

  .pw-reply {
    font-size: 21px;
  }

  .pw-composer-wrap {
    padding: 10px 14px max(10px, env(safe-area-inset-bottom));
  }

  .pw-composer-inner {
    border-radius: 26px;
  }

  .pw-composer-input {
    padding-left: 16px;
    font-size: 18px;
  }

  .pw-metric-row {
    gap: 12px;
    padding: 18px 0;
  }

  .pw-metric-number {
    font-size: 36px;
  }

  .pw-flow-grid {
    gap: 24px;
  }

  .pw-flow-publish {
    right: max(14px, env(safe-area-inset-right));
    bottom: calc(62px + env(safe-area-inset-bottom) + 14px);
    min-height: 46px;
    padding: 0 15px;
  }

  .pw-site-entry-title {
    font-size: 20px;
  }

  .pw-site-entry-body p {
    font-size: 16px;
  }

  .pw-commercial-head {
    display: block;
  }

  .pw-commercial-total {
    margin-top: 14px;
    text-align: left;
  }

  .pw-commercial-product {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .pw-commercial-product-money {
    grid-column: 1 / -1;
    text-align: left;
  }

  .pw-preview {
    padding: 18px;
  }

  .pw-preview-title {
    font-size: 26px;
  }

  .pw-recent-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .pw-recent-status {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pw-root *,
  .pw-root *::before,
  .pw-root *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}

```
