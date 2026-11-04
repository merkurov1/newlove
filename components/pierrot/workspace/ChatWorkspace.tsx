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
