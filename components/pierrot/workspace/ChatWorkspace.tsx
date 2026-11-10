'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUp, Square, X } from 'lucide-react';
import type {
  OwnerConversation,
  OwnerSessionListItem,
  WorkspaceOverview,
} from '@/lib/pierrot/workspace/types';
import {
  parsePierrotResponse,
  retrievalStateLabel,
  sourceTypeLabel,
  totalSourceCount,
  type SourceBundle,
} from '@/lib/pierrot/workspace/chatParser';
import { PIERROT_CONSENT_VERSION } from '@/lib/pierrot/conversation';
import {
  PierrotStreamProtocolError,
  consumePierrotEventStream,
  type PierrotStreamStage,
} from '@/lib/pierrot/streamProtocol';
import { isRefreshStatusCommand } from '@/lib/pierrot/workspace/refreshCommand';
import { readOverviewCache, writeOverviewCache } from '@/lib/pierrot/workspace/cache';
import WorkspaceMarkdown from './WorkspaceMarkdown';
import GroomingPlanCard from './GroomingPlanCard';
import PierrotAvatar from './PierrotAvatar';
import { useOnlineStatus } from './useOnlineStatus';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import HomeOverview from './HomeOverview';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import type { GroomingPlanView } from '@/lib/pierrot/grooming/types';
import { detectProjectReviewCommand } from '@/lib/pierrot/projects/commands';

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
  groomingPlan?: GroomingPlanView | null;
  error?: boolean;
  streaming?: boolean;
  interrupted?: boolean;
  /** Local deterministic command acknowledgement; never sent to the model. */
  local?: boolean;
  sessionId?: string | null;
  historySequence?: number | null;
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

function withoutLastUser(messages: UiMessage[]): UiMessage[] {
  let index = -1;

  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === 'user') {
      index = cursor;
      break;
    }
  }

  return index >= 0 ? messages.filter((_, cursor) => cursor !== index) : messages;
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
    feedback: message.feedback || undefined,
    sessionId: message.sessionId || null,
    historySequence: message.historySequence ?? null,
  }));
}

function conversationViewKey(conversation: OwnerConversation | null): string {
  if (!conversation) return 'empty';
  return `${conversation.historyId || 'main'}:${conversation.currentSessionId || 'latest'}`;
}

export default function ChatWorkspace({
  ownerId,
  overview,
  sessions,
  conversation,
  startNew,
  brainStatus,
  project,
}: {
  ownerId: string;
  overview: WorkspaceOverview;
  sessions: OwnerSessionListItem[];
  conversation: OwnerConversation | null;
  startNew: boolean;
  brainStatus?: BrainStatusSnapshot | null;
  project?: PierrotProject | null;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [overviewState, setOverviewState] = useState<WorkspaceOverview>(overview);
  const [brainSnapshot, setBrainSnapshot] = useState<BrainStatusSnapshot | null>(
    brainStatus ?? null
  );
  const [messages, setMessages] = useState<UiMessage[]>(() => initialMessages(conversation));
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(Boolean(conversation?.hasMore));
  const [oldestIndex, setOldestIndex] = useState<number | null>(
    conversation?.oldestSequence ?? conversation?.oldestMessageIndex ?? null
  );
  const [conversationId, setConversationId] = useState<string | null>(conversation?.id ?? null);
  const [sessionId, setSessionId] = useState<string | null>(conversation?.sessionId ?? null);
  const [historyId, setHistoryId] = useState<string | null>(conversation?.historyId ?? null);
  const [episodeId, setEpisodeId] = useState<string | null>(conversation?.currentSessionId ?? null);
  const [title, setTitle] = useState<string>(conversation?.title ?? 'Новый диалог');
  const [newSessionLoading, setNewSessionLoading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<SelectedSources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamStage, setStreamStage] = useState<PierrotStreamStage | null>(null);
  const [retryPrompt, setRetryPrompt] = useState<string | null>(null);
  // The owner workspace is an authenticated, owner-only PWA. Its history is
  // always stored; there is no per-session consent switch in this interface.
  const consent: Consent = {
    state: 'granted',
    version: PIERROT_CONSENT_VERSION,
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inspectorScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<'user' | 'timeout' | null>(null);
  const mountedRef = useRef(true);
  const atBottomRef = useRef(true);
  const deltaBufferRef = useRef('');
  const deltaFrameRef = useRef<number | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const draftRef = useRef('');
  const activeViewKeyRef = useRef(conversationViewKey(conversation));

  // The composer owns its draft. Updates to the transcript or to server props
  // must never write into it; only an explicit send/new-chat clears it.
  const setComposerDraft = useCallback((value: string) => {
    draftRef.current = value;
    setDraft(value);
  }, []);

  const clearDraftIfUnchanged = useCallback((submittedDraft: string) => {
    if (draftRef.current !== submittedDraft) return;
    draftRef.current = '';
    setDraft('');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // The page intentionally keeps this component mounted across history and
  // session changes. Reconcile the transcript when the selected view changes,
  // but leave the draft, caret and focus untouched.
  useEffect(() => {
    const nextViewKey = conversationViewKey(conversation);
    if (activeViewKeyRef.current === nextViewKey) return;

    activeViewKeyRef.current = nextViewKey;

    abortRef.current?.abort();
    abortRef.current = null;
    abortReasonRef.current = null;
    streamingMessageIdRef.current = null;
    deltaBufferRef.current = '';
    if (deltaFrameRef.current !== null) {
      window.cancelAnimationFrame(deltaFrameRef.current);
      deltaFrameRef.current = null;
    }

    setMessages(initialMessages(conversation));
    setConversationId(conversation?.id ?? null);
    setSessionId(conversation?.sessionId ?? null);
    setHistoryId(conversation?.historyId ?? null);
    setEpisodeId(conversation?.currentSessionId ?? null);
    setTitle(conversation?.title ?? 'Новый диалог');
    setHasOlder(Boolean(conversation?.hasMore));
    setOldestIndex(conversation?.oldestSequence ?? conversation?.oldestMessageIndex ?? null);
    setLoading(false);
    setStreamStage(null);
    setError(null);
    setRetryPrompt(null);
    setSelectedSources(null);
    setInspectorOpen(false);
  }, [conversation]);

  useEffect(() => {
    const cached = readOverviewCache(ownerId);
    if (!cached) return;

    setOverviewState((current) => {
      const cachedTime = Date.parse(cached.savedAt);
      const currentTime = Date.parse(current.generatedAt);

      if (current.stale && !cached.stale) return cached.overview;
      if (!Number.isFinite(cachedTime)) return current;
      if (Number.isFinite(currentTime) && cachedTime <= currentTime) return current;

      return { ...cached.overview, stale: cached.stale };
    });
  }, [ownerId]);

  useEffect(() => {
    if (overviewState.stale) return;
    // Preserve the original snapshot time; a cached navigation must not make
    // old analytics look freshly computed.
    writeOverviewCache(ownerId, overviewState, overviewState.generatedAt);
  }, [ownerId, overviewState]);


  const startNewSession = useCallback(async () => {
    if (newSessionLoading) return;
    const targetHistoryId = historyId || conversation?.historyId || null;
    if (!targetHistoryId) {
      setError('История ещё не готова. Обнови страницу.');
      return;
    }
    setNewSessionLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/pierrot/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: targetHistoryId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        session?: { id?: string };
        historyId?: string;
        error?: string;
      };
      if (!response.ok || !payload.session?.id) {
        throw new Error(payload.error || 'Не удалось начать новую сессию.');
      }
      setMessages([]);
      setComposerDraft('');
      setEpisodeId(payload.session.id);
      setTitle('Новая сессия');
      setHasOlder(false);
      setOldestIndex(null);
      setSelectedSources(null);
      setInspectorOpen(false);
      setError(null);
      setStreamStage(null);
      setRetryPrompt(null);
      setLoading(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      router.replace(
        `/admin/pierrot?history=${encodeURIComponent(
          payload.historyId || targetHistoryId
        )}&session=${encodeURIComponent(payload.session.id)}`
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось начать новую сессию.');
    } finally {
      setNewSessionLoading(false);
    }
  }, [conversation?.historyId, historyId, newSessionLoading, router, setComposerDraft]);

  useEffect(() => {
    if (!startNew) return;
    void startNewSession();
  }, [startNew, startNewSession]);

  useEffect(() => {
    function onNewSession() {
      if (
        draft.trim() &&
        !window.confirm(
          'Начать новую сессию? Неотправленный текст будет потерян, а сохранённая история останется.'
        )
      ) {
        return;
      }

      // The avatar always starts a MAIN-chat session. A project chat keeps its
      // own canonical history until the owner explicitly opens it again.
      if (project) {
        router.push('/admin/pierrot?new=1');
        return;
      }
      void startNewSession();
    }

    window.addEventListener('pierrot:new-session', onNewSession as EventListener);
    return () => window.removeEventListener('pierrot:new-session', onNewSession as EventListener);
  }, [draft, project, router, startNewSession]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (messages.length === 0 && !loading) {
      element.scrollTop = 0;
      return;
    }

    if (atBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, loading, streamStage]);

  function onTranscriptScroll() {
    const element = scrollRef.current;
    if (!element) return;

    atBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  }

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(168, element.scrollHeight)}px`;
  }, [draft]);

  async function loadOlderMessages() {
    if (!historyId || loadingOlder || !hasOlder || oldestIndex == null) return;

    const scrollElement = scrollRef.current;
    const previousHeight = scrollElement?.scrollHeight ?? 0;
    setLoadingOlder(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/pierrot/conversations?historyId=${encodeURIComponent(
          historyId
        )}&beforeSequence=${oldestIndex}&limit=120${
          episodeId ? `&sessionId=${encodeURIComponent(episodeId)}` : ''
        }`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Не удалось загрузить старые сообщения.');

      const incoming: UiMessage[] = Array.isArray(data.messages)
        ? (data.messages as unknown[])
            .filter(
              (
                message: unknown
              ): message is {
                id: string;
                role: 'user' | 'assistant';
                content: string;
                createdAt: string | null;
                provider?: string | null;
                sessionId?: string | null;
                historySequence?: number | null;
                feedback?: 'up' | 'down' | null;
              } =>
                Boolean(message) &&
                typeof message === 'object' &&
                typeof (message as Record<string, unknown>).id === 'string' &&
                ((message as Record<string, unknown>).role === 'user' ||
                  (message as Record<string, unknown>).role === 'assistant') &&
                typeof (message as Record<string, unknown>).content === 'string'
            )
            .map((message): UiMessage => ({
              id: message.id,
              role: message.role,
              content: message.content,
              createdAt: message.createdAt || null,
              provider: message.provider || null,
              serverMessageId: message.id,
              sessionId: message.sessionId || null,
              historySequence: message.historySequence ?? null,
              feedback: message.feedback || undefined,
            }))
        : [];

      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...incoming.filter((message) => !existing.has(message.id)), ...current];
      });
      setHasOlder(Boolean(data.hasMore));
      if (typeof data.oldestSequence === 'number') setOldestIndex(data.oldestSequence);
      else if (typeof data.oldestMessageIndex === 'number') setOldestIndex(data.oldestMessageIndex);

      window.requestAnimationFrame(() => {
        const element = scrollRef.current;
        if (!element) return;
        element.scrollTop = element.scrollHeight - previousHeight;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить старые сообщения.');
    } finally {
      setLoadingOlder(false);
    }
  }

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

  async function submitFeedback(message: UiMessage, rating: 'up' | 'down') {
    if (message.feedback) return;
    if (!conversationId || !sessionId || !message.serverMessageId) return;

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, feedback: rating, feedbackError: false } : item
      )
    );

    try {
      const response = await fetch('/api/pierrot/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          sessionId,
          ...(historyId ? { historyId } : {}),
          ...(episodeId ? { episodeId } : {}),
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
        current.map((item) => (item.id === message.id ? { ...item, feedbackError: true } : item))
      );
    }
  }

  function applyAssistantDelta(id: string, text: string) {
    if (!text) return;

    setMessages((current) =>
      current.map((item) => (item.id === id ? { ...item, content: item.content + text } : item))
    );
  }

  function flushDeltaBuffer(id: string) {
    if (deltaFrameRef.current !== null) {
      window.cancelAnimationFrame(deltaFrameRef.current);
      deltaFrameRef.current = null;
    }

    const chunk = deltaBufferRef.current;
    deltaBufferRef.current = '';
    applyAssistantDelta(id, chunk);
  }

  function queueDelta(id: string, text: string) {
    deltaBufferRef.current += text;

    if (deltaFrameRef.current !== null) return;

    deltaFrameRef.current = window.requestAnimationFrame(() => {
      deltaFrameRef.current = null;
      const chunk = deltaBufferRef.current;
      deltaBufferRef.current = '';
      applyAssistantDelta(id, chunk);
    });
  }

  function stopGeneration() {
    abortReasonRef.current = 'user';
    abortRef.current?.abort();
  }

  function retryLast() {
    if (!retryPrompt || loading) return;

    setRetryPrompt(null);
    setError(null);
    void send(retryPrompt, { retry: true });
  }

  async function runRefreshCommand(text: string, submittedDraft: string = text) {
    if (loading || !online) return;

    const userMessage: UiMessage = {
      id: `local-command-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      local: true,
    };
    const assistantId = `local-refresh-${Date.now()}`;

    setError(null);
    setRetryPrompt(null);
    setStreamStage(null);
    setLoading(true);
    clearDraftIfUnchanged(submittedDraft);
    atBottomRef.current = true;
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch('/api/admin/pierrot/overview', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        partial?: boolean;
        overview?: WorkspaceOverview | null;
        brainStatus?: BrainStatusSnapshot | null;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'refresh_failed');
      }

      const nextOverview = payload.overview ?? null;
      const nextBrain = payload.brainStatus ?? null;

      if (nextOverview) {
        setOverviewState({ ...nextOverview, stale: false });
      } else {
        setOverviewState((current) => ({ ...current, stale: true }));
      }
      if (nextBrain) {
        setBrainSnapshot(nextBrain);
      } else {
        setBrainSnapshot((current) => (current ? { ...current, stale: true } : current));
      }

      let confirmation: string;
      if (nextOverview && nextBrain) {
        confirmation = payload.partial
          ? 'Обновил состояние. Часть источников ответила с ошибкой; подробности в DASH.'
          : 'Состояние обновлено: показатели за 7 дней и память.';
      } else if (nextOverview) {
        confirmation =
          'Показатели за 7 дней обновлены. Память сейчас недоступна; оставил последнее известное состояние.';
      } else if (nextBrain) {
        confirmation =
          'Память обновлена. Показатели сейчас недоступны; оставил последнее известное состояние.';
      } else {
        throw new Error('refresh_failed');
      }

      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: 'assistant',
          content: confirmation,
          createdAt: new Date().toISOString(),
          local: true,
        },
      ]);
    } catch {
      if (!mountedRef.current) return;
      setOverviewState((current) => ({ ...current, stale: true }));
      setBrainSnapshot((current) => (current ? { ...current, stale: true } : current));
      setError('Не удалось обновить состояние. Оставил последнее известное.');
      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: 'assistant',
          content:
            'Обновить не удалось. Оставил последнее известное состояние; данные не заменены нулями.',
          createdAt: new Date().toISOString(),
          local: true,
        },
      ]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function send(explicitText?: string, options: { retry?: boolean } = {}) {
    const submittedDraft = explicitText ?? draft;
    const text = submittedDraft.trim();
    if (!text || loading || !online) return;

    if (!options.retry && isRefreshStatusCommand(text)) {
      await runRefreshCommand(text, submittedDraft);
      return;
    }

    const isRetry = options.retry === true;
    const previousMessages = messages;
    const userMessage: UiMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      sessionId: episodeId,
    };
    const assistantUiId = `stream-${Date.now()}`;

    setError(null);
    setRetryPrompt(null);
    setStreamStage(null);
    setLoading(true);
    atBottomRef.current = true;
    deltaBufferRef.current = '';
    streamingMessageIdRef.current = assistantUiId;

    setMessages((current) => {
      const base = isRetry ? current.filter((item) => !item.interrupted) : current;
      return [
        ...base,
        ...(isRetry ? [] : [userMessage]),
        {
          id: assistantUiId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          streaming: true,
          sessionId: episodeId,
        },
      ];
    });

    if (!isRetry && previousMessages.length === 0) {
      setTitle(text.length > 92 ? `${text.slice(0, 89).trimEnd()}…` : text);
    }

    const historySource = isRetry ? withoutLastUser(previousMessages) : previousMessages;
    const history = historySource
      .filter((message) => !message.error && !message.interrupted && !message.local)
      .map((message) => ({ role: message.role, content: message.content }));

    const controller = new AbortController();
    abortRef.current = controller;
    abortReasonRef.current = null;
    const timeout = window.setTimeout(() => {
      abortReasonRef.current = 'timeout';
      controller.abort();
    }, 60_000);

    let receivedAny = false;
    const streamState: {
      completed: Record<string, unknown> | null;
      error: {
        error: string;
        code: string;
        retryAfter?: number;
        retryable?: boolean;
        interrupted?: boolean;
      } | null;
    } = { completed: null, error: null };

    const applyCompleted = (payload: Record<string, unknown>) => {
      const parsed = parsePierrotResponse(payload);
      const reply = parsed.reply;

      if (!reply) throw new Error('Pierrot не вернул текст ответа.');

      flushDeltaBuffer(assistantUiId);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantUiId
            ? {
                ...item,
                content: reply,
                provider: parsed.provider,
                serverMessageId: parsed.assistantMessageId,
                sources: parsed.sources,
                answerLabel: parsed.answerLabel,
                groomingPlan: parsed.groomingPlan,
                streaming: false,
                interrupted: false,
                error: false,
              }
            : item
        )
      );

      if (parsed.conversationId) setConversationId(parsed.conversationId);
      if (parsed.sessionId) setSessionId(parsed.sessionId);
      if (parsed.historyId) setHistoryId(parsed.historyId);
      if (parsed.episodeId) setEpisodeId(parsed.episodeId);

      if (parsed.recorded) {
        router.refresh();
      } else {
        setError('Ответ получен, но диалог не сохранён: сохранение выключено или не разрешено.');
      }
    };

    try {
      const response = await fetch('/api/pierrot-web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: text,
          stream: true,
          ...(conversationId ? { conversationId } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(historyId ? { historyId } : {}),
          ...(episodeId ? { episodeId } : {}),
          consent,
          context: {
            pathname: '/admin/pierrot',
            referrer: typeof document !== 'undefined' ? document.referrer : undefined,
            ...(project?.slug ? { project: project.slug } : {}),
          },
          history,
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        await consumePierrotEventStream(response, {
          onAccepted: (event) => {
            clearDraftIfUnchanged(submittedDraft);
            setConversationId(event.conversationId);
            setSessionId(event.sessionId);
            if (event.historyId) setHistoryId(event.historyId);
            if (event.episodeId) setEpisodeId(event.episodeId);
          },
          onStatus: (event) => setStreamStage(event.stage),
          onDelta: (chunk) => {
            receivedAny = true;
            queueDelta(assistantUiId, chunk);
          },
          onSources: (payload) => {
            const parsed = parsePierrotResponse(payload);
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantUiId
                  ? { ...item, sources: parsed.sources, answerLabel: parsed.answerLabel }
                  : item
              )
            );
          },
          onCompleted: (payload) => {
            streamState.completed = payload;
          },
          onError: (event) => {
            streamState.error = event;
          },
        });

        if (!response.ok) {
          throw new Error(`Запрос не выполнен (${response.status}).`);
        }

        if (streamState.error) {
          const failure = new Error(
            streamState.error.error || 'Не удалось получить ответ.'
          ) as Error & {
            code?: string;
            retryAfter?: number;
            interrupted?: boolean;
          };
          failure.code = streamState.error.code;
          failure.retryAfter = streamState.error.retryAfter;
          failure.interrupted = streamState.error.interrupted;
          throw failure;
        }

        if (!streamState.completed) {
          throw new PierrotStreamProtocolError('stream_ended_before_completion');
        }

        applyCompleted(streamState.completed);
      } else {
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

        clearDraftIfUnchanged(submittedDraft);
        flushDeltaBuffer(assistantUiId);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantUiId
              ? {
                  ...item,
                  content: parsed.reply as string,
                  provider: parsed.provider,
                  serverMessageId: parsed.assistantMessageId,
                  sources: parsed.sources,
                  answerLabel: parsed.answerLabel,
                  groomingPlan: parsed.groomingPlan,
                  streaming: false,
                  interrupted: false,
                  error: false,
                }
              : item
          )
        );

        if (parsed.conversationId) setConversationId(parsed.conversationId);
        if (parsed.sessionId) setSessionId(parsed.sessionId);
        if (parsed.historyId) setHistoryId(parsed.historyId);
        if (parsed.episodeId) setEpisodeId(parsed.episodeId);

        if (parsed.recorded) {
          router.refresh();
        } else {
          setError('Ответ получен, но диалог не сохранён: сохранение выключено или не разрешено.');
        }
      }
    } catch (caught) {
      if (!mountedRef.current || streamingMessageIdRef.current !== assistantUiId) return;

      flushDeltaBuffer(assistantUiId);

      const isAbort =
        caught instanceof DOMException
          ? caught.name === 'AbortError'
          : caught instanceof Error && caught.name === 'AbortError';
      const failure = caught as Error & {
        code?: string;
        retryAfter?: number;
        interrupted?: boolean;
      };
      const stopReason =
        abortReasonRef.current === 'timeout'
          ? 'Ответ не пришёл за 60 секунд. Сообщение не отправлено повторно автоматически.'
          : 'Генерация остановлена.';

      if (receivedAny) {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantUiId
              ? { ...item, streaming: false, interrupted: true, error: true }
              : item
          )
        );
        setError(
          isAbort
            ? stopReason
            : failure.interrupted
              ? 'Ответ прерван. Можно повторить запрос.'
              : failure.message || 'Ответ прерван.'
        );
        setRetryPrompt(text);
      } else {
        setMessages((current) => current.filter((item) => item.id !== assistantUiId));
        setError(
          isAbort
            ? stopReason
            : caught instanceof PierrotStreamProtocolError
              ? 'Поток ответа повреждён. Попробуйте ещё раз.'
              : caught instanceof Error
                ? caught.message
                : 'Не удалось получить ответ.'
        );
        setRetryPrompt(text);
      }
    } finally {
      window.clearTimeout(timeout);
      if (mountedRef.current) {
        setLoading(false);
        setStreamStage(null);
      }
      streamingMessageIdRef.current = null;
      abortRef.current = null;
      abortReasonRef.current = null;
    }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
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
  }

  function submitGroomingPlan(command: string) {
    setMessages((current) =>
      current.map((message) =>
        message.groomingPlan ? { ...message, groomingPlan: null } : message
      )
    );
    void send(command);
  }

  const streamingMessage = messages.find((message) => message.streaming);
  const hasStreamingContent = Boolean(streamingMessage?.content.trim());
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const reviewInProgress =
    loading && Boolean(lastUserMessage && detectProjectReviewCommand(lastUserMessage.content));
  const streamStageLabel = reviewInProgress
    ? 'Pierrot проверяет историю, задачи, решения и материалы проекта'
    : streamStage === 'retrieving'
      ? 'Pierrot ищет в архиве'
      : streamStage === 'persisting'
        ? 'Pierrot сохраняет ответ'
        : 'Pierrot формулирует ответ';
  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions]
  );

  return (
    <div className="pw-chat" data-inspector={inspectorOpen ? 'open' : 'closed'}>
      <section className="pw-center" aria-label="Разговор с Pierrot">
        <header className="pw-chat-head">
          <div className="pw-chat-head-copy">
            <h1 className="pw-chat-head-title">{conversation?.historyTitle || title}</h1>
            <span className="pw-chat-head-sub">
              {project && (
                <span
                  className="pw-conversation-project"
                  title={`Контекст проекта: ${project.name}`}
                >
                  {project.name}
                </span>
              )}
              {project && title && title !== (conversation?.historyTitle || title)
                ? ' · '
                : null}
              {title && title !== (conversation?.historyTitle || title) && (
                <span className="pw-session-caption">{title}</span>
              )}
            </span>
          </div>

          {!online && (
            <span className="pw-chat-head-meta" role="status">
              offline
            </span>
          )}
        </header>

        <div className="pw-chat-scroll" ref={scrollRef} onScroll={onTranscriptScroll}>
          {messages.length === 0 ? (
            <HomeOverview
              key={episodeId || conversation?.currentSessionId || 'new'}
              overview={overviewState}
              brainStatus={brainSnapshot}
              sessionId={episodeId || conversation?.currentSessionId || null}
            />
          ) : (
            <div className="pw-chat-thread">
              {hasOlder && (
                <div className="pw-history-more">
                  <button
                    type="button"
                    className="pw-history-more-button"
                    onClick={() => void loadOlderMessages()}
                    disabled={loadingOlder}
                  >
                    {loadingOlder ? 'Загружаем…' : 'Загрузить более ранние сообщения'}
                  </button>
                </div>
              )}
              {conversation?.hasNewer && historyId && (
                <div className="pw-history-more">
                  <Link
                    className="pw-history-more-button"
                    href={`/admin/pierrot?history=${encodeURIComponent(historyId)}`}
                  >
                    Перейти к последним сообщениям
                  </Link>
                </div>
              )}
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const showSessionDivider = Boolean(
                  message.sessionId && message.sessionId !== previous?.sessionId
                );
                const session = message.sessionId ? sessionById.get(message.sessionId) : null;
                const messageSourceCount = message.sources ? totalSourceCount(message.sources) : 0;

                return (
                  <React.Fragment key={message.id}>
                    {showSessionDivider && (
                      <div className="pw-session-divider" role="separator">
                        <span>{session?.title || 'Сессия'}</span>
                        {session?.startedAt && (
                          <time dateTime={session.startedAt}>
                            {formatConversationDate(session.startedAt)}
                          </time>
                        )}
                      </div>
                    )}
                    <article
                      className={`pw-message ${message.role === 'user' ? 'pw-message-user' : ''}`}
                    >
                      {message.role === 'user' ? (
                        <div className="pw-bubble-user">{message.content}</div>
                      ) : (
                        <>
                          <div className="pw-message-head">
                            <div className="pw-message-head-left">
                              <PierrotAvatar size={24} />
                              <span className="pw-message-label">
                                {message.local ? 'Состояние' : 'Pierrot'}
                                {message.provider ? ` · ${message.provider}` : ''}
                              </span>
                            </div>
                          </div>

                          <WorkspaceMarkdown
                            className="pw-reply"
                            content={message.content}
                            citationCount={messageSourceCount}
                            onCitation={(index) => openSources(message, index)}
                            streaming={message.streaming}
                            editorial
                          />

                          {!message.streaming && message.groomingPlan && (
                            <GroomingPlanCard
                              plan={message.groomingPlan}
                              disabled={loading || !online}
                              onSubmit={submitGroomingPlan}
                            />
                          )}

                          {message.interrupted && (
                            <p className="pw-stream-note" role="status">
                              Ответ прерван. Можно повторить запрос.
                            </p>
                          )}

                          {!message.streaming && !message.interrupted && !message.local && (
                            <div className="pw-feedback" role="group" aria-label="Оценка ответа">
                              <span className="pw-feedback-label">Ответ полезен?</span>
                              <button
                                type="button"
                                className="pw-feedback-button"
                                aria-label="Ответ полезен"
                                aria-pressed={message.feedback === 'up'}
                                disabled={
                                  !conversationId ||
                                  !sessionId ||
                                  !message.serverMessageId ||
                                  Boolean(message.feedback)
                                }
                                title="Оценить ответ"
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
                                  !conversationId ||
                                  !sessionId ||
                                  !message.serverMessageId ||
                                  Boolean(message.feedback)
                                }
                                title="Оценить ответ"
                                onClick={() => void submitFeedback(message, 'down')}
                              >
                                Нет
                              </button>
                              {message.feedbackError && (
                                <span className="pw-feedback-error">не отправлено</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  </React.Fragment>
                );
              })}

              {loading && !hasStreamingContent && (
                <p className="pw-typing" role="status" aria-live="polite">
                  <span aria-hidden="true" />
                  {streamStageLabel}
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
            {retryPrompt && !loading && (
              <>
                {' '}
                <button type="button" className="pw-link-button" onClick={retryLast}>
                  Повторить
                </button>
              </>
            )}
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
              onChange={(event) => setComposerDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={online ? 'Напишите Пьеро' : 'Нет соединения'}
              rows={1}
              disabled={!online}
              aria-label="Сообщение Пьеро"
            />

            {loading ? (
              <button
                type="button"
                className="pw-send pw-stop"
                onClick={stopGeneration}
                aria-label="Остановить генерацию"
              >
                <Square size={13} strokeWidth={2} fill="currentColor" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="pw-send"
                onClick={() => void send()}
                disabled={!online || !draft.trim()}
                aria-label="Отправить сообщение"
              >
                <ArrowUp size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
            )}
          </div>

        </div>
      </section>

      {inspectorOpen && selectedSources && (
        <div
          className="pw-source-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Источники ответа"
          onClick={(event) => {
            if (event.target === event.currentTarget) setInspectorOpen(false);
          }}
        >
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
                              {[
                                source.sourceDomain,
                                source.author,
                                source.publishedAt?.slice(0, 10),
                              ]
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
        </div>
      )}
    </div>
  );
}
