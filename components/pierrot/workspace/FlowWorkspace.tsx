'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, PenLine, RefreshCw, Trash2 } from 'lucide-react';
import { normalizeFlowItem } from '@/lib/flow/content';
import { readDistributionState, readDistributionUrl } from '@/lib/flow/distribution';
import type { FlowChannelConfig, FlowItemRow } from '@/lib/pierrot/workspace/types';
import {
  FLOW_UNDO_WINDOW_MS,
  beginDraftCreation,
  cancelPublishing,
  draftCreated,
  draftCreationFailed,
  initialPublishLifecycle,
  publishingFailed,
  remainingMs,
  type FlowPublishLifecycle,
} from '@/lib/pierrot/workspace/publishLifecycle';
import { readWorkspaceHandoff } from '@/lib/pierrot/workspace/handoff';
import WorkspaceMarkdown from './WorkspaceMarkdown';
import { useOnlineStatus } from './useOnlineStatus';

type Busy = null | 'draft' | 'publish' | 'cancel' | 'edit' | 'delete' | 'retry';

const TYPES = [
  { value: 'note', label: 'заметка' },
  { value: 'article', label: 'статья' },
  { value: 'link', label: 'ссылка' },
  { value: 'quote', label: 'цитата' },
] as const;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'published':
      return 'опубликовано';
    case 'draft':
      return 'черновик';
    case 'archived':
      return 'архив';
    default:
      return status || '—';
  }
}

function channelLabel(state: ReturnType<typeof readDistributionState>): string {
  if (!state) return 'не отправлялось';
  switch (state.status) {
    case 'published':
      return 'опубликовано';
    case 'failed':
      return 'ошибка';
    case 'uncertain':
      return 'не подтверждено';
    case 'skipped':
      return 'пропущено';
    case 'processing':
      return 'отправляется';
    default:
      return state.status || 'не отправлялось';
  }
}

function summarizeChannels(metadata: unknown): string {
  const telegram = channelLabel(readDistributionState(metadata, 'telegram'));
  const bluesky = channelLabel(readDistributionState(metadata, 'bluesky'));
  return `Telegram: ${telegram} · Bluesky: ${bluesky}`;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; message?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `Запрос не выполнен (${response.status}).`
    );
  }

  return payload as T;
}

export default function FlowWorkspace({
  items,
  channels,
}: {
  items: FlowItemRow[];
  channels: FlowChannelConfig;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('note');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<FlowPublishLifecycle>(initialPublishLifecycle);
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const handoffRef = useRef(false);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const publishingRef = useRef(false);
  const cancelModeRef = useRef<'delete' | 'keep'>('delete');

  useEffect(() => {
    if (handoffRef.current) return;
    const handoff = readWorkspaceHandoff('flow');
    if (!handoff) return;
    handoffRef.current = true;
    setText(handoff);
    setType(handoff.length > 600 ? 'article' : 'note');
  }, []);

  const preview = useMemo(
    () =>
      normalizeFlowItem({
        title: title.trim() || null,
        body_md: text,
        type,
        lang,
        status: 'published',
        visibility: 'public',
      }),
    [lang, text, title, type]
  );

  const undoRemaining = remainingMs(lifecycle, clock);

  const publishDraft = useCallback(
    async (draftId: string) => {
      if (publishingRef.current) return;
      publishingRef.current = true;
      setLifecycle((current) => ({
        ...current,
        phase: 'publishing',
        deadline: null,
        error: null,
      }));
      setBusy('publish');
      setError(null);
      setMessage(null);

      try {
        await api(`/api/flow/items/${encodeURIComponent(draftId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'published', visibility: 'public' }),
        });

        let metadata: unknown = null;
        try {
          const fresh = await api<{ item: FlowItemRow }>(
            `/api/flow/items/${encodeURIComponent(draftId)}`,
            { method: 'GET' }
          );
          metadata = fresh.item?.metadata ?? null;
        } catch {
          metadata = null;
        }

        setLifecycle(initialPublishLifecycle());
        setMessage(
          metadata
            ? `Опубликовано. ${summarizeChannels(metadata)}.`
            : 'Опубликовано. Состояние внешних каналов не удалось перечитать.'
        );
        setTitle('');
        setText('');
        setEditingId(null);
        router.refresh();
      } catch (caught) {
        const textError = caught instanceof Error ? caught.message : 'Публикация не удалась.';
        setLifecycle((current) => publishingFailed(current, textError));
        setError(
          `${textError} Запись осталась черновиком; повторная публикация не запущена автоматически.`
        );
      } finally {
        setBusy(null);
        publishingRef.current = false;
      }
    },
    [router]
  );

  useEffect(() => {
    if (lifecycle.phase !== 'undo' || !lifecycle.deadline || !lifecycle.draftId) return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= (lifecycle.deadline as number)) {
        window.clearInterval(interval);
        void publishDraft(lifecycle.draftId as string);
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [lifecycle.deadline, lifecycle.draftId, lifecycle.phase, publishDraft]);

  useEffect(() => {
    if (lifecycle.phase !== 'undo' && lifecycle.phase !== 'publishing') return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [lifecycle.phase]);

  async function createDraft() {
    if (!online || !preview.bodyText.trim() || busy) return;
    if (
      lifecycle.phase === 'undo' ||
      lifecycle.phase === 'publishing' ||
      (lifecycle.phase === 'failed' && lifecycle.draftId)
    ) {
      return;
    }

    setBusy('draft');
    setLifecycle(beginDraftCreation());
    setError(null);
    setMessage(null);

    try {
      const data = await api<{ item: FlowItemRow }>('/api/flow/items', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || null,
          body_md: text,
          type,
          lang,
          status: 'draft',
          visibility: 'public',
        }),
      });

      if (!data.item?.id) throw new Error('Сервер не вернул черновик.');
      cancelModeRef.current = 'delete';
      setLifecycle(draftCreated(data.item.id, Date.now(), FLOW_UNDO_WINDOW_MS));
      setClock(Date.now());
      setMessage(
        'Черновик создан. Публикация начнётся через 10 секунд. Можно отменить.'
      );
    } catch (caught) {
      const errorText = caught instanceof Error ? caught.message : 'Черновик не создан.';
      setLifecycle(draftCreationFailed(errorText));
      setError(errorText);
    } finally {
      setBusy(null);
    }
  }

  async function cancelDraft() {
    if (lifecycle.phase !== 'undo' || !lifecycle.draftId) return;

    const draftId = lifecycle.draftId;
    setLifecycle((current) => cancelPublishing(current));
    setBusy('cancel');
    setError(null);

    try {
      if (cancelModeRef.current === 'keep') {
        setMessage('Публикация отменена. Черновик сохранён.');
      } else {
        await api(`/api/flow/items/${encodeURIComponent(draftId)}`, { method: 'DELETE' });
        setMessage('Публикация отменена. Черновик удалён.');
      }
      setLifecycle(initialPublishLifecycle());
    } catch (caught) {
      setMessage(
        `Публикация отменена. Черновик остался неопубликованным: ${
          caught instanceof Error ? caught.message : 'удалить не удалось'
        }.`
      );
      setLifecycle(initialPublishLifecycle());
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function retryPublish() {
    if (!lifecycle.draftId || lifecycle.phase !== 'failed') return;
    await publishDraft(lifecycle.draftId);
  }

  function armExistingDraft(item: FlowItemRow) {
    if (lifecycle.phase === 'undo' || lifecycle.phase === 'publishing') return;
    cancelModeRef.current = 'keep';
    setLifecycle(draftCreated(item.id, Date.now(), FLOW_UNDO_WINDOW_MS));
    setClock(Date.now());
    setError(null);
    setMessage('Черновик готов к публикации. Есть 10 секунд, чтобы отменить.');
    pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startEdit(item: FlowItemRow) {
    setEditingId(item.id);
    setTitle(item.title || '');
    setText(item.body_md || '');
    setType(
      TYPES.some((entry) => entry.value === item.type)
        ? (item.type as (typeof TYPES)[number]['value'])
        : 'note'
    );
    setLang(item.lang === 'en' ? 'en' : 'ru');
    setLifecycle(initialPublishLifecycle());
    setError(null);
    setMessage(null);
    pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveEdit() {
    if (!editingId || !online) return;

    setBusy('edit');
    setError(null);
    setMessage(null);

    try {
      await api(`/api/flow/items/${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim() || null,
          body_md: text,
          type,
          lang,
        }),
      });
      setMessage(
        'Изменения сохранены. Внешние копии в Telegram и Bluesky существующий backend автоматически не обновляет.'
      );
      setEditingId(null);
      setTitle('');
      setText('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить изменения.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteItem(item: FlowItemRow) {
    if (!online) return;
    const confirmed = window.confirm(
      'Удалить запись? Существующий backend также попытается удалить внешние копии. Это действие нельзя отменить.'
    );
    if (!confirmed) return;

    setBusy('delete');
    setError(null);
    setMessage(null);

    try {
      await api(`/api/flow/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setMessage('Запись удалена.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Удаление не удалось.');
    } finally {
      setBusy(null);
    }
  }

  async function retryCrosspost(item: FlowItemRow) {
    if (!online) return;

    setBusy('retry');
    setError(null);
    setMessage(null);

    try {
      const data = await api<{
        results?: Array<{ channel?: string; status?: string; error?: string | null }>;
        channels?: Record<string, { status?: string; error?: string | null }>;
      }>('/api/flow/crosspost', {
        method: 'POST',
        body: JSON.stringify({ id: item.id, retryFailed: true }),
      });

      const summary = data.channels
        ? Object.entries(data.channels)
            .map(([channel, state]) => `${channel}: ${state.status || '—'}`)
            .join(' · ')
        : 'crosspost завершён';
      setMessage(`Повторная отправка: ${summary}.`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Повторная отправка не удалась.'
      );
    } finally {
      setBusy(null);
    }
  }

  const canRetryDraft = lifecycle.phase === 'failed' && Boolean(lifecycle.draftId);
  const undoSeconds = Math.ceil(undoRemaining / 1000);

  return (
    <>
      <div className="pw-flow-band" aria-hidden="true" />

      <div className="pw-page pw-flow-page" ref={pageRef}>
        <div className="pw-page-inner">
          <p className="pw-kicker">FLOW · ПУБЛИЧНО</p>
          <h1 className="pw-page-title">{editingId ? 'Редактировать запись' : 'Опубликовать'}</h1>
          <p className="pw-page-lede">
            Preview использует тот же резолвер контента, что и публичная страница. Публикация
            идёт через существующий Flow lifecycle.
          </p>

          <div className="pw-flow-grid">
            <div className="pw-form">
              <label className="pw-label">
                Заголовок · необязательно
                <input
                  className="pw-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Оставьте пустым — Flow выведет заголовок из текста"
                  maxLength={240}
                />
              </label>

              <label className="pw-label">
                Текст
                <textarea
                  className="pw-textarea"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Что публикуем?"
                />
              </label>

              <div>
                <p className="pw-label" style={{ marginBottom: 8 }}>
                  Тип
                </p>
                <div className="pw-form-row" role="group" aria-label="Тип записи">
                  {TYPES.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      className="pw-chip"
                      aria-pressed={type === entry.value}
                      onClick={() => setType(entry.value)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="pw-label" style={{ marginBottom: 8 }}>
                  Язык
                </p>
                <div className="pw-form-row" role="group" aria-label="Язык записи">
                  <button
                    type="button"
                    className="pw-chip"
                    aria-pressed={lang === 'ru'}
                    onClick={() => setLang('ru')}
                  >
                    русский
                  </button>
                  <button
                    type="button"
                    className="pw-chip"
                    aria-pressed={lang === 'en'}
                    onClick={() => setLang('en')}
                  >
                    english
                  </button>
                </div>
              </div>

              <div>
                <p className="pw-label" style={{ marginBottom: 8 }}>
                  Каналы
                </p>
                <div className="pw-channel-row">
                  <span className="pw-channel-name">Telegram</span>
                  <span className="pw-channel-state">
                    {channels.telegram
                      ? 'настроен · отправляется автоматически'
                      : 'не подключён'}
                  </span>
                </div>
                <div className="pw-channel-row">
                  <span className="pw-channel-name">Bluesky</span>
                  <span className="pw-channel-state">
                    {channels.bluesky
                      ? 'настроен · отправляется автоматически'
                      : 'не подключён'}
                  </span>
                </div>
                <div className="pw-channel-row">
                  <span className="pw-channel-name">RSS</span>
                  <span className="pw-channel-state">
                    публичная лента ·{' '}
                    <a href="/flow/rss.xml" target="_blank" rel="noopener noreferrer">
                      /flow/rss.xml
                    </a>
                  </span>
                </div>
                <p className="pw-kicker" style={{ marginTop: 10 }}>
                  Отдельные каналы не переключаются: существующий publish/crosspost отправляет
                  во все настроенные каналы.
                </p>
              </div>

              {error && (
                <div className="pw-notice pw-notice-warning" role="alert">
                  {error}
                </div>
              )}

              {message && (
                <div className="pw-notice" role="status">
                  {message}
                </div>
              )}

              {lifecycle.phase === 'undo' && lifecycle.draftId && (
                <div className="pw-undo" role="status" aria-live="polite">
                  <div>
                    <div className="pw-undo-text">
                      Публикация через <span className="pw-undo-count">{undoSeconds}s</span>
                    </div>
                    <p className="pw-kicker" style={{ marginTop: 4 }}>
                      Если закрыть вкладку, запись останется неопубликованным черновиком.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="pw-button"
                    onClick={() => void cancelDraft()}
                    disabled={busy !== null}
                  >
                    Отменить
                  </button>
                </div>
              )}

              {canRetryDraft && (
                <div className="pw-notice pw-notice-warning">
                  <p>Черновик создан, но публикация не завершилась.</p>
                  <button
                    type="button"
                    className="pw-button pw-button-small"
                    style={{ marginTop: 10 }}
                    onClick={() => void retryPublish()}
                    disabled={busy !== null}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    Повторить публикацию
                  </button>
                </div>
              )}

              <div className="pw-form-row">
                {editingId ? (
                  <>
                    <button
                      type="button"
                      className="pw-button pw-button-primary"
                      onClick={() => void saveEdit()}
                      disabled={!online || busy !== null || !text.trim()}
                    >
                      {busy === 'edit' ? 'Сохраняю…' : 'Сохранить изменения'}
                    </button>
                    <button
                      type="button"
                      className="pw-button"
                      onClick={() => {
                        setEditingId(null);
                        setTitle('');
                        setText('');
                      }}
                      disabled={busy !== null}
                    >
                      Отменить редактирование
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="pw-button pw-button-primary"
                    onClick={() => void createDraft()}
                    disabled={
                      !online ||
                      busy !== null ||
                      !text.trim() ||
                      lifecycle.phase === 'undo' ||
                      lifecycle.phase === 'publishing' ||
                      (lifecycle.phase === 'failed' && Boolean(lifecycle.draftId))
                    }
                  >
                    {busy === 'draft'
                      ? 'Создаю черновик…'
                      : lifecycle.phase === 'publishing'
                        ? 'Публикую…'
                        : 'Опубликовать'}
                  </button>
                )}
              </div>
            </div>

            <aside className="pw-preview" aria-label="Предпросмотр публикации">
              <div className="pw-preview-head">
                <span className="pw-section-title">Так увидят читатели</span>
                <span className="pw-channel-state">{statusLabel('published')}</span>
              </div>
              {preview.showTitle && (
                <h2 className="pw-preview-title">{preview.title}</h2>
              )}
              {preview.body ? (
                <WorkspaceMarkdown className="pw-preview-body" content={preview.body} />
              ) : (
                <p className="pw-preview-body" style={{ color: 'var(--pw-muted)' }}>
                  Текст появится здесь.
                </p>
              )}
              <p className="pw-preview-meta">
                {preview.language.toUpperCase()} · {preview.contentType}
                {preview.sourceUrl ? ' · источник указан' : ''}
              </p>
            </aside>
          </div>

          <section style={{ marginTop: 48 }} aria-label="Последние публикации">
            <h2 className="pw-section-title">Последние записи</h2>

            {items.length === 0 ? (
              <p className="pw-notice">Публикаций пока нет.</p>
            ) : (
              <ul className="pw-flow-list">
                {items.map((item) => {
                  const normalized = normalizeFlowItem(item);
                  const telegram = readDistributionState(item.metadata, 'telegram');
                  const bluesky = readDistributionState(item.metadata, 'bluesky');
                  const telegramUrl = readDistributionUrl(item.metadata, 'telegram');
                  const blueskyUrl = readDistributionUrl(item.metadata, 'bluesky');
                  const hasFailure =
                    telegram?.status === 'failed' ||
                    telegram?.status === 'uncertain' ||
                    bluesky?.status === 'failed' ||
                    bluesky?.status === 'uncertain';

                  return (
                    <li key={item.id} className="pw-flow-item">
                      <div className="pw-flow-item-head">
                        <h3 className="pw-flow-item-title">{normalized.title}</h3>
                        <span className="pw-flow-item-meta">
                          {formatDate(item.published_at)} · {statusLabel(item.status)}
                        </span>
                      </div>
                      <p className="pw-flow-item-excerpt">
                        {normalized.bodyExcerpt || 'Без текста'}
                      </p>
                      <p className="pw-flow-item-meta">
                        Telegram: {channelLabel(telegram)} · Bluesky: {channelLabel(bluesky)}
                      </p>
                      <div className="pw-flow-item-actions">
                        {item.status === 'draft' && (
                          <>
                            <button
                              type="button"
                              className="pw-button pw-button-small pw-button-primary"
                              onClick={() => armExistingDraft(item)}
                              disabled={
                                busy !== null ||
                                !online ||
                                lifecycle.phase === 'undo' ||
                                lifecycle.phase === 'publishing'
                              }
                            >
                              Опубликовать
                            </button>
                            <button
                              type="button"
                              className="pw-button pw-button-small pw-button-danger"
                              onClick={() => void deleteItem(item)}
                              disabled={busy !== null || !online}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                              Удалить черновик
                            </button>
                          </>
                        )}
                        {item.slug && (
                          <a
                            className="pw-button pw-button-small"
                            href={`/flow/${encodeURIComponent(item.slug)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={13} aria-hidden="true" />
                            Открыть
                          </a>
                        )}
                        {telegramUrl && (
                          <a
                            className="pw-button pw-button-small"
                            href={telegramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Telegram ↗
                          </a>
                        )}
                        {blueskyUrl && (
                          <a
                            className="pw-button pw-button-small"
                            href={blueskyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Bluesky ↗
                          </a>
                        )}
                        <button
                          type="button"
                          className="pw-button pw-button-small"
                          onClick={() => startEdit(item)}
                          disabled={busy !== null || !online}
                        >
                          <PenLine size={13} aria-hidden="true" />
                          Редактировать
                        </button>
                        {hasFailure && item.status === 'published' && (
                          <button
                            type="button"
                            className="pw-button pw-button-small"
                            onClick={() => void retryCrosspost(item)}
                            disabled={busy !== null || !online}
                          >
                            <RefreshCw size={13} aria-hidden="true" />
                            Повторить crosspost
                          </button>
                        )}
                        <button
                          type="button"
                          className="pw-button pw-button-small pw-button-danger"
                          onClick={() => void deleteItem(item)}
                          disabled={busy !== null || !online}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          Удалить
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
