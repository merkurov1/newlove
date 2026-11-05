'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  ChevronRight,
  GitBranch,
  PanelRight,
  Plus,
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react';
import WorkspaceMarkdown from './WorkspaceMarkdown';
import DevTaskStudio from './DevTaskStudio';
import { useOnlineStatus } from './useOnlineStatus';
import type {
  DevDiagnosis,
  DevMemoryEntry,
  DevRepositoryStatus,
  DevTask,
  DevToolEvent,
  DevToolTraceEntry,
  DevTokenUsage,
} from '@/lib/pierrot/dev/types';

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
  toolTrace?: DevToolTraceEntry[];
  events?: DevToolEvent[];
  requestStatus?: string | null;
  usage?: DevTokenUsage | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  diagnosis?: DevDiagnosis | null;
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
    toolTrace?: DevToolTraceEntry[];
    events?: DevToolEvent[];
    requestStatus?: string | null;
    usage?: DevTokenUsage | null;
    latencyMs?: number | null;
    errorCode?: string | null;
    diagnosis?: DevDiagnosis | null;
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
    writeToolsAvailable: boolean;
  };
  repositories: DevRepositoryStatus[];
  vercel: {
    detected: boolean;
    tokenConfigured: boolean;
  };
};

type StreamFinalPayload = {
  reply?: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  toolTrace?: DevToolTraceEntry[];
  events?: DevToolEvent[];
  usage?: DevTokenUsage;
  requestId?: string;
  status?: string;
  latencyMs?: number;
  warnings?: string[];
  diagnosis?: DevDiagnosis | null;
  error?: string;
  code?: string;
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

function shortSha(value: string | null): string {
  return value ? value.slice(0, 7) : '—';
}

function initialMessages(conversation: DevConversation | null): DevMessage[] {
  if (!conversation) return [];

  return conversation.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    provider: message.provider || null,
    createdAt: message.createdAt || null,
    toolTrace: message.toolTrace,
    events: message.events,
    requestStatus: message.requestStatus,
    usage: message.usage,
    latencyMs: message.latencyMs,
    errorCode: message.errorCode,
    diagnosis: message.diagnosis || null,
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

function ToolTrace({ trace }: { trace: DevToolTraceEntry[] }) {
  if (trace.length === 0) return null;

  return (
    <details className="pw-dev-tools-details">
      <summary>
        <Terminal size={12} aria-hidden="true" />
        tools · {trace.length}
        {trace.some((tool) => !tool.ok) ? ' · errors' : ''}
      </summary>
      <div className="pw-dev-tools">
        {trace.map((tool, index) => (
          <span
            key={`${tool.name}-${index}`}
            className={tool.ok ? 'is-ok' : 'is-error'}
            title={[
              tool.summary,
              tool.meta?.repository,
              tool.meta?.branch,
              tool.meta?.complete === false ? 'incomplete' : null,
              ...(tool.meta?.warnings || []),
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            {tool.name}
            {tool.meta?.repository ? ` · ${tool.meta.repository.split('/').pop()}` : ''}
            {tool.meta?.complete === false ? ' · partial' : ''}
          </span>
        ))}
      </div>
      <ul className="pw-dev-tool-list">
        {trace.map((tool, index) => (
          <li key={`${tool.name}-detail-${index}`}>
            <span>{tool.name}</span>
            <span>{tool.summary}</span>
            <span>{tool.durationMs} ms</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function DiagnosisCard({
  diagnosis,
  onCreateTask,
}: {
  diagnosis: DevDiagnosis;
  onCreateTask: () => void;
}) {
  const tone =
    diagnosis.confidence === 'confirmed'
      ? 'is-verified'
      : diagnosis.confidence === 'likely'
        ? 'is-warn'
        : 'is-unverified';

  return (
    <section className="pw-dev-diagnosis" aria-label="Структурированная диагностика">
      <div className="pw-dev-diagnosis-head">
        <span className="pw-dev-kicker">DIAGNOSIS</span>
        <span className={`pw-dev-verdict ${tone}`}>{diagnosis.confidence}</span>
      </div>
      <p className="pw-dev-diagnosis-summary">{diagnosis.taskSummary}</p>
      <p className="pw-dev-diagnosis-facts">
        {diagnosis.repository} · {diagnosis.ref} ·{' '}
        {diagnosis.commitSha ? diagnosis.commitSha.slice(0, 7) : 'commit unknown'} ·{' '}
        {diagnosis.inspectedFiles.length} files
      </p>

      {diagnosis.inspectedFiles.length > 0 && (
        <details className="pw-dev-diagnosis-details">
          <summary>Файлы и свидетельства</summary>
          <ul>
            {diagnosis.inspectedFiles.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                {file.startLine ? `:${file.startLine}-${file.endLine || file.startLine}` : ''}
              </li>
            ))}
          </ul>
          {diagnosis.confirmedFindings.length > 0 && (
            <ul>
              {diagnosis.confirmedFindings.map((finding, index) => (
                <li key={`confirmed-${index}`}>
                  <strong>confirmed</strong> {finding.statement}
                  {finding.evidence ? ` · ${finding.evidence}` : ''}
                </li>
              ))}
            </ul>
          )}
          {diagnosis.likelyFindings.length > 0 && (
            <ul>
              {diagnosis.likelyFindings.map((finding, index) => (
                <li key={`likely-${index}`}>
                  <strong>likely</strong> {finding.statement}
                </li>
              ))}
            </ul>
          )}
          {diagnosis.hypotheses.length > 0 && (
            <ul>
              {diagnosis.hypotheses.map((finding, index) => (
                <li key={`hypothesis-${index}`}>
                  <strong>unverified</strong> {finding.statement}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {diagnosis.shouldCreateTask && (
        <button type="button" className="pw-dev-action" onClick={onCreateTask}>
          <Plus size={14} aria-hidden="true" />
          Задание из диагностики
        </button>
      )}
    </section>
  );
}

export default function DevWorkspace({
  conversations,
  conversation,
  integration,
  migrationRequired,
  tasks,
  taskMigrationRequired,
  requestStoreAvailable,
  memory,
}: {
  conversations: DevConversationListItem[];
  conversation: DevConversation | null;
  integration: IntegrationStatus;
  migrationRequired: boolean;
  tasks: DevTask[];
  taskMigrationRequired: boolean;
  requestStoreAvailable: boolean;
  memory: DevMemoryEntry[];
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [messages, setMessages] = useState<DevMessage[]>(() => initialMessages(conversation));
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(conversation?.id ?? null);
  const [title, setTitle] = useState(conversation?.title ?? 'Dev-тред');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [liveTools, setLiveTools] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [taskCreateNonce, setTaskCreateNonce] = useState(0);
  const [activeRepoKey, setActiveRepoKey] = useState<string>(
    () =>
      integration.repositories.find((repo) => repo.accessible)?.key ||
      integration.repositories[0]?.key ||
      'newlove'
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const retryRef = useRef<{
    text: string;
    requestId: string;
    conversationId: string | null;
  } | null>(null);

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
  }, [loading, messages.length, phase]);

  const activeRepo = useMemo(
    () =>
      integration.repositories.find((repo) => repo.key === activeRepoKey) ||
      integration.repositories[0] ||
      null,
    [activeRepoKey, integration.repositories]
  );

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant'),
    [messages]
  );

  const conversationContext = useMemo(
    () =>
      messages
        .slice(-8)
        .map((message) => `${message.role === 'user' ? 'OWNER' : 'PIERROT'}: ${message.content}`)
        .join('\n\n')
        .slice(0, 12_000),
    [messages]
  );

  const suggestedTitle = useMemo(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    const clean = (lastUser?.content || title || 'Инженерное задание').replace(/\s+/g, ' ').trim();
    return clean.length > 92 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
  }, [messages, title]);

  function resetThread() {
    setMessages([]);
    setDraft('');
    setConversationId(null);
    setTitle('Dev-тред');
    setError(null);
    setNotice(null);
    setThreadsOpen(false);
    retryRef.current = null;
    router.replace('/admin/pierrot/dev');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function applyAssistantPayload(payload: StreamFinalPayload) {
    if (typeof payload.conversationId === 'string') {
      setConversationId(payload.conversationId);
    }

    setMessages((current) => [
      ...current,
      {
        id: `reply-${Date.now()}`,
        role: 'assistant',
        content: String(payload.reply || ''),
        provider: typeof payload.provider === 'string' ? payload.provider : null,
        createdAt: new Date().toISOString(),
        toolTrace: Array.isArray(payload.toolTrace) ? payload.toolTrace : [],
        events: Array.isArray(payload.events) ? payload.events : [],
        requestStatus: typeof payload.status === 'string' ? payload.status : 'completed',
        usage: payload.usage || null,
        latencyMs: typeof payload.latencyMs === 'number' ? payload.latencyMs : null,
        errorCode: typeof payload.code === 'string' ? payload.code : null,
        diagnosis: payload.diagnosis || null,
      },
    ]);
  }

  async function send() {
    const text = draft.trim();
    if (!text || loading || !online || !integration.github.configured || inFlightRef.current) {
      return;
    }

    const retry =
      retryRef.current &&
      retryRef.current.text === text &&
      retryRef.current.conversationId === conversationId
        ? retryRef.current
        : null;
    const requestId =
      retry?.requestId ||
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setPhase(`Подключаюсь к ${activeRepo?.fullName || 'репозиторию'}`);
    setLiveTools([]);
    setDraft('');
    setThreadsOpen(false);

    if (!retry) {
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
    }

    let finalPayload: StreamFinalPayload | null = null;
    let effectiveConversationId = conversationId;

    try {
      const response = await fetch('/api/admin/pierrot/dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: text,
          requestId,
          idempotencyKey: requestId,
          stream: true,
          repository: activeRepo?.key || activeRepoKey,
          ...(conversationId ? { conversationId } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Dev request failed (${response.status}).`);
      }

      const headerConversationId = response.headers.get('x-conversation-id');
      if (headerConversationId) {
        effectiveConversationId = headerConversationId;
        setConversationId(headerConversationId);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
            if (!line) continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (event.type === 'status') {
              if (typeof event.label === 'string') setPhase(event.label);
            } else if (event.type === 'tool') {
              const label = [event.tool, event.summary]
                .filter((value) => typeof value === 'string')
                .join(' · ');
              if (label) {
                setLiveTools((current) => [...current.slice(-5), label]);
              }
            } else if (event.type === 'final') {
              finalPayload = event.payload as StreamFinalPayload;
            }
          }
        }
      } else {
        finalPayload = (await response.json().catch(() => null)) as StreamFinalPayload | null;
      }

      if (!finalPayload) {
        throw new Error('Dev response ended without a final payload.');
      }

      if (!mountedRef.current) return;

      if (finalPayload.error) {
        // Preserve the partial tool trace in the transcript even when the
        // provider failed before producing a conclusion.
        applyAssistantPayload({
          ...finalPayload,
          reply: finalPayload.error,
        });
        throw new Error(finalPayload.error);
      }

      if (typeof finalPayload.conversationId === 'string') {
        effectiveConversationId = finalPayload.conversationId;
      }
      applyAssistantPayload(finalPayload);
      retryRef.current = null;
      setPhase(null);
      setLiveTools([]);
      router.refresh();
    } catch (caught) {
      if (!mountedRef.current) return;
      const messageText = caught instanceof Error ? caught.message : 'Dev request failed.';
      setError(messageText);
      setPhase(null);
      retryRef.current = {
        text,
        requestId,
        conversationId: effectiveConversationId,
      };
      setDraft(text);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setPhase(null);
      }
      inFlightRef.current = false;
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  }

  const writesLabel = integration.github.writesEnabled ? 'writes flag on' : 'read-only';

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

      {contextOpen && (
        <button
          type="button"
          className="pw-dev-context-scrim"
          aria-label="Закрыть контекст"
          onClick={() => setContextOpen(false)}
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
                  ? 'GITHUB_TOKEN активен. Доступны только read-only tools.'
                  : integration.github.authError || 'GITHUB_TOKEN не настроен'
              }
            />
            <StatusChip
              label={`${activeRepo?.key || 'repo'} · ${activeRepo?.workBranch || '—'}`}
              tone={activeRepo?.accessible ? 'ok' : 'off'}
              title={
                activeRepo
                  ? `${activeRepo.fullName} · commit ${activeRepo.lastCommitSha || 'unknown'}`
                  : 'Репозиторий не выбран'
              }
            />
            <StatusChip
              label={`${shortSha(activeRepo?.lastCommitSha || null)}`}
              tone={activeRepo?.accessible ? 'ok' : 'off'}
              title={activeRepo?.error || 'Актуальный commit SHA головы рабочей ветки'}
            />
            <StatusChip
              label={writesLabel}
              tone={integration.github.writesEnabled ? 'warn' : 'off'}
              title="Запись в GitHub не входит в текущий Dev Mode"
            />
          </div>

          <button
            type="button"
            className="pw-dev-context-toggle"
            onClick={() => setContextOpen((value) => !value)}
            aria-label="Открыть инженерный контекст"
            aria-expanded={contextOpen}
          >
            <PanelRight size={17} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>

        {migrationRequired && (
          <div className="pw-dev-banner" role="alert">
            Нужна миграция <code>2026-11-17_pierrot_dev_mode.sql</code>. Без неё Dev-треды не
            сохраняются в Supabase.
          </div>
        )}

        {taskMigrationRequired && (
          <div className="pw-dev-banner" role="alert">
            Нужна миграция <code>2026-11-18_pierrot_dev_engineering.sql</code>. Task Studio работает
            в ограниченном режиме.
          </div>
        )}

        {!requestStoreAvailable && !taskMigrationRequired && (
          <div className="pw-dev-banner" role="alert">
            Трассы запросов не сохраняются. Нужна миграция{' '}
            <code>2026-11-18_pierrot_dev_engineering.sql</code>.
          </div>
        )}

        {!integration.github.configured && (
          <div className="pw-dev-banner" role="alert">
            GitHub access не настроен: нет <code>GITHUB_TOKEN</code>. Пока токен недоступен, Dev
            Mode не будет вызывать модель для исследования репозитория.
          </div>
        )}

        <div className="pw-dev-body">
          <div className="pw-dev-scroll" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="pw-dev-empty">
                <p className="pw-dev-kicker">ENGINEERING ENVIRONMENT</p>
                <h2>Что исследуем?</h2>
                <p>
                  Пьеро ищет по репозиторию, читает нужные файлы, показывает repository, branch и
                  commit SHA и отделяет подтверждённые факты от гипотез. RAG и обычная история чата
                  сюда не подмешиваются.
                </p>
                <p className="pw-dev-empty-facts">
                  {activeRepo?.fullName || integration.github.repo} ·{' '}
                  {activeRepo?.workBranch || integration.github.defaultBranch} ·{' '}
                  {integration.github.authenticated
                    ? `GitHub @${integration.github.login || 'authenticated'}`
                    : integration.github.configured
                      ? 'GitHub auth failed'
                      : 'GitHub access off'}
                </p>
                <div className="pw-dev-suggestions">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft('Проверь, почему на главной Flow не загружаются preview изображения')
                    }
                  >
                    почему не работает…
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft(
                        'Изучи, как сейчас реализована навигация и PWA-оболочка в owner workspace'
                      )
                    }
                  >
                    как реализовано…
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft('Найди в репозитории причину и подготовь задачу для OpenCode')
                    }
                  >
                    найти и подготовить задачу
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
                        <span>
                          {message.provider || 'model'}
                          {message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ''}
                          {message.requestStatus === 'partially_completed'
                            ? ' · partial'
                            : message.requestStatus === 'failed'
                              ? ' · failed'
                              : ''}
                        </span>
                      </div>
                      <WorkspaceMarkdown className="pw-dev-answer" content={message.content} />
                      {message.diagnosis && (
                        <DiagnosisCard
                          diagnosis={message.diagnosis}
                          onCreateTask={() => {
                            setTaskCreateNonce((value) => value + 1);
                            setContextOpen(true);
                          }}
                        />
                      )}
                      {message.toolTrace && <ToolTrace trace={message.toolTrace} />}
                    </article>
                  )
                )}

                {loading && (
                  <div className="pw-dev-typing" role="status">
                    <span>{phase || 'Исследую репозиторий'}</span>
                    {liveTools.length > 0 && (
                      <ul>
                        {liveTools.map((tool, index) => (
                          <li key={`${tool}-${index}`}>{tool}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside
            className="pw-dev-context"
            data-open={contextOpen ? 'true' : 'false'}
            aria-label="Инженерный контекст"
          >
            <div className="pw-dev-context-head">
              <span className="pw-dev-label">CONTEXT</span>
              <button
                type="button"
                className="pw-icon-button pw-dev-context-close"
                onClick={() => setContextOpen(false)}
                aria-label="Закрыть контекст"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <section className="pw-dev-context-section">
              <div className="pw-dev-context-title">
                <GitBranch size={13} aria-hidden="true" />
                Активный проект
              </div>
              <select
                className="pw-dev-repo-select"
                value={activeRepoKey}
                onChange={(event) => setActiveRepoKey(event.target.value)}
                aria-label="Активный репозиторий"
              >
                {integration.repositories.map((repo) => (
                  <option key={repo.key} value={repo.key}>
                    {repo.key} · {repo.fullName}
                  </option>
                ))}
              </select>
              {activeRepo ? (
                <dl className="pw-dev-facts">
                  <div>
                    <dt>branch</dt>
                    <dd>{activeRepo.workBranch}</dd>
                  </div>
                  <div>
                    <dt>commit</dt>
                    <dd title={activeRepo.lastCommitSha || ''}>
                      {activeRepo.lastCommitSha || 'нет данных'}
                    </dd>
                  </div>
                  <div>
                    <dt>access</dt>
                    <dd>{activeRepo.accessible ? 'read-only ok' : activeRepo.error || 'off'}</dd>
                  </div>
                  <div>
                    <dt>checked</dt>
                    <dd>{formatThreadDate(activeRepo.checkedAt)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="pw-dev-context-muted">Репозитории не настроены.</p>
              )}
              <button
                type="button"
                className="pw-dev-context-action"
                onClick={() => router.refresh()}
              >
                <RefreshCw size={13} aria-hidden="true" />
                обновить статус
              </button>
            </section>

            <section className="pw-dev-context-section">
              <div className="pw-dev-context-title">
                <ChevronRight size={13} aria-hidden="true" />
                Последнее исследование
              </div>
              {lastAssistant?.toolTrace && lastAssistant.toolTrace.length > 0 ? (
                <ul className="pw-dev-research-list">
                  {lastAssistant.toolTrace.slice(-8).map((tool, index) => (
                    <li key={`${tool.name}-${index}`}>
                      <span className={tool.ok ? 'is-ok' : 'is-error'}>{tool.name}</span>
                      <span>{tool.summary}</span>
                      {tool.meta?.repository && <small>{tool.meta.repository}</small>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pw-dev-context-muted">
                  Ещё нет tool trace в этом треде. Задайте вопрос о коде или изменениях.
                </p>
              )}
            </section>

            <section className="pw-dev-context-section">
              <div className="pw-dev-context-title">Project memory</div>
              <ul className="pw-dev-memory-list">
                {memory.slice(0, 6).map((entry) => (
                  <li key={entry.id}>
                    <details>
                      <summary>
                        <span>{entry.title}</span>
                        <small>{entry.area}</small>
                      </summary>
                      <p>{entry.content}</p>
                      <p className="pw-dev-memory-source">
                        {entry.source} · {entry.updatedAt} · commit {shortSha(entry.commitSha)} ·{' '}
                        {entry.status}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>

            <DevTaskStudio
              initialTasks={tasks}
              repositories={integration.repositories.map((repo) => ({
                key: repo.key,
                label: repo.key,
                fullName: repo.fullName,
                workBranch: repo.workBranch,
                lastCommitSha: repo.lastCommitSha,
              }))}
              activeRepository={activeRepoKey}
              conversationId={conversationId}
              conversationContext={conversationContext}
              suggestedTitle={suggestedTitle}
              diagnosis={lastAssistant?.diagnosis || null}
              createNonce={taskCreateNonce}
              onCopyPrompt={(prompt) => setNotice(`Prompt скопирован · ${prompt.length} символов`)}
            />
          </aside>
        </div>

        {notice && (
          <div className="pw-dev-notice" role="status">
            {notice}
          </div>
        )}

        {error && (
          <div className="pw-dev-error" role="alert">
            {error}
            {retryRef.current && (
              <button type="button" onClick={() => void send()} disabled={loading}>
                повторить тот же requestId
              </button>
            )}
          </div>
        )}

        <div className="pw-dev-composer-wrap">
          <div className="pw-dev-composer">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                !online
                  ? 'Нет соединения'
                  : !integration.github.configured
                    ? 'GitHub access не настроен'
                    : 'Вопрос о newlove или Pierrot · Enter — отправить'
              }
              rows={1}
              disabled={!online || !integration.github.configured}
              aria-label="Сообщение Pierrot Dev"
            />
            <button
              type="button"
              className="pw-dev-send"
              onClick={() => void send()}
              disabled={!online || !integration.github.configured || loading || !draft.trim()}
              aria-label="Отправить в Dev"
            >
              <ArrowUp size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
          <div className="pw-dev-meta">
            <span>
              mode=dev · read-only · 2 repos ·{' '}
              {requestStoreAvailable ? 'trace persisted' : 'trace off'}
            </span>
            <span>
              {activeRepo?.fullName || integration.github.repo} ·{' '}
              {activeRepo?.workBranch || integration.github.defaultBranch} ·{' '}
              {shortSha(activeRepo?.lastCommitSha || null)}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
