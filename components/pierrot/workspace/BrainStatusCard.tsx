'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Brain, Check, Loader2, RefreshCw, Search } from 'lucide-react';
import type {
  BrainIssue,
  BrainState,
  BrainStatusSnapshot,
} from '@/lib/pierrot/memory/brainStatusTypes';
import type { StewardReport } from '@/lib/pierrot/memory/types';

const STATE_LABEL: Record<BrainState, string> = {
  stable: 'Stable',
  attention: 'Attention',
  updating: 'Updating',
  degraded: 'Degraded',
};

function formatChecked(value: string | null): string {
  if (!value) return 'проверка не выполнялась';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'проверка не выполнялась';

  return `проверено ${new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`;
}

function issueLabel(issue: BrainIssue): string {
  switch (issue.code) {
    case 'storage_unavailable':
      return 'Хранилище недоступно';
    case 'retrieval_unavailable':
      return 'Поиск недоступен';
    case 'embedding_provider_unavailable':
      return 'Провайдер embeddings недоступен';
    case 'index_pending':
      return 'Ожидает индексации';
    case 'index_failed':
      return 'Ошибка индексации';
    case 'conflicts':
      return 'Противоречия';
    case 'stale_temporary':
      return 'Устаревшие заметки';
    case 'overdue_tasks':
      return 'Просроченные задачи';
    case 'never_checked':
      return 'Проверка не выполнена';
    default:
      return issue.message;
  }
}

export default function BrainStatusCard({ initial }: { initial: BrainStatusSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<BrainStatusSnapshot | null>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'detail' | 'check' | 'cleanup' | 'index' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<StewardReport | null>(null);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setBusy('detail');
    setError(null);

    try {
      const response = await fetch('/api/pierrot/brain-status?detail=1');
      if (!response.ok) throw new Error('status_failed');
      const payload = (await response.json()) as BrainStatusSnapshot;
      setSnapshot(payload);
    } catch {
      setError('Состояние Brain сейчас недоступно.');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (snapshot?.detail) return;
    void loadDetail();
  }, [loadDetail, open, snapshot?.detail]);

  async function checkNow() {
    setBusy('check');
    setError(null);

    try {
      const response = await fetch('/api/pierrot/brain-status', { method: 'POST' });
      if (!response.ok) throw new Error('check_failed');
      setSnapshot((await response.json()) as BrainStatusSnapshot);
    } catch {
      setError('Проверка не выполнена. Показано последнее известное состояние.');
    } finally {
      setBusy(null);
    }
  }

  async function showCleanup() {
    setBusy('cleanup');
    setError(null);

    try {
      const response = await fetch('/api/pierrot/memory/steward?limit=20');
      if (!response.ok) throw new Error('cleanup_failed');
      setCleanup((await response.json()) as StewardReport);
    } catch {
      setError('Не удалось получить кандидатов на очистку.');
    } finally {
      setBusy(null);
    }
  }

  async function indexPending() {
    setBusy('index');
    setError(null);
    setIndexMessage(null);

    try {
      const response = await fetch('/api/pierrot/memory/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      });
      const payload = (await response.json().catch(() => null)) as {
        indexed?: number;
        failed?: number;
        pending?: number;
        reason?: string;
      } | null;

      if (!response.ok) {
        setIndexMessage(
          payload?.reason === 'embedding_provider_unavailable'
            ? 'Провайдер embeddings не настроен. Записи останутся доступны по словам.'
            : 'Индексация сейчас недоступна.'
        );
        return;
      }

      setIndexMessage(
        `Проиндексировано: ${payload?.indexed ?? 0}. Ошибок: ${payload?.failed ?? 0}. Осталось: ${
          payload?.pending ?? 0
        }.`
      );
      await loadDetail();
    } catch {
      setIndexMessage('Индексация не выполнена.');
    } finally {
      setBusy(null);
    }
  }

  function toggleOpen() {
    setOpen((value) => !value);
  }

  if (!snapshot) {
    return (
      <button type="button" className="pw-brain-status" onClick={toggleOpen}>
        <span className="pw-brain-status-icon" aria-hidden="true">
          <Brain size={18} strokeWidth={1.5} />
        </span>
        <span className="pw-brain-status-body">
          <span className="pw-brain-status-head">
            <span className="pw-brain-status-name">BRAIN</span>
            <span className="pw-brain-status-state" data-state="degraded">
              Degraded
            </span>
          </span>
          <span className="pw-brain-status-summary">
            Состояние ещё не загружено. Нажмите, чтобы проверить.
          </span>
        </span>
      </button>
    );
  }

  return (
    <section className="pw-brain-status-wrap" aria-label="Состояние Brain">
      <button type="button" className="pw-brain-status" onClick={toggleOpen} aria-expanded={open}>
        <span className="pw-brain-status-icon" aria-hidden="true">
          <Brain size={18} strokeWidth={1.5} />
        </span>
        <span className="pw-brain-status-body">
          <span className="pw-brain-status-head">
            <span className="pw-brain-status-name">BRAIN</span>
            <span className="pw-brain-status-state" data-state={snapshot.state}>
              {STATE_LABEL[snapshot.state]}
            </span>
          </span>
          <span className="pw-brain-status-summary">{snapshot.summary}</span>
          <span className="pw-brain-status-time">
            {formatChecked(snapshot.checkedAt)}
            {snapshot.stale ? ' · последнее известное' : ''}
          </span>
        </span>
      </button>

      {open && (
        <div className="pw-brain-detail">
          <div className="pw-brain-detail-head">
            <span className="pw-section-title">Состояние Brain</span>
            <button
              type="button"
              className="pw-brain-detail-close"
              onClick={() => setOpen(false)}
              aria-label="Закрыть состояние Brain"
            >
              Закрыть
            </button>
          </div>

          {error && <p className="pw-brain-detail-error">{error}</p>}

          <dl className="pw-brain-metrics">
            <div>
              <dt>Temporal Memory</dt>
              <dd>{snapshot.detail?.temporalMemory ?? '—'}</dd>
            </div>
            <div>
              <dt>Brain retrieval</dt>
              <dd>{snapshot.detail?.brainRetrieval ?? '—'}</dd>
            </div>
            <div>
              <dt>Embeddings</dt>
              <dd>{snapshot.detail?.embeddings ?? '—'}</dd>
            </div>
            <div>
              <dt>Активные / архив</dt>
              <dd>
                {snapshot.metrics.activeRecords} / {snapshot.metrics.archivedRecords}
              </dd>
            </div>
            <div>
              <dt>Незавершённые задачи</dt>
              <dd>{snapshot.metrics.openTasks}</dd>
            </div>
            <div>
              <dt>Противоречия</dt>
              <dd>{snapshot.metrics.conflicts}</dd>
            </div>
            <div>
              <dt>Индекс: готово / ждёт / ошибки</dt>
              <dd>
                {snapshot.metrics.embeddingsReady} / {snapshot.metrics.embeddingsPending} /{' '}
                {snapshot.metrics.embeddingsFailed}
              </dd>
            </div>
            <div>
              <dt>Последняя проверка</dt>
              <dd>{snapshot.checkedAt ? formatChecked(snapshot.checkedAt) : '—'}</dd>
            </div>
          </dl>

          {snapshot.issues.length > 0 && (
            <ul className="pw-brain-issues">
              {snapshot.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`} data-severity={issue.severity}>
                  {issue.severity === 'error' ? (
                    <AlertTriangle size={12} aria-hidden="true" />
                  ) : (
                    <Check size={12} aria-hidden="true" />
                  )}
                  <span>
                    {issueLabel(issue)}
                    {typeof issue.count === 'number' ? `: ${issue.count}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="pw-brain-actions">
            <button type="button" onClick={() => void checkNow()} disabled={busy !== null}>
              {busy === 'check' ? (
                <Loader2 size={13} className="pw-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={13} aria-hidden="true" />
              )}
              Проверить сейчас
            </button>
            <button type="button" onClick={() => void showCleanup()} disabled={busy !== null}>
              {busy === 'cleanup' ? (
                <Loader2 size={13} className="pw-spin" aria-hidden="true" />
              ) : (
                <Search size={13} aria-hidden="true" />
              )}
              Показать кандидатов на очистку
            </button>
            <button type="button" onClick={() => void checkNow()} disabled={busy !== null}>
              <AlertTriangle size={13} aria-hidden="true" />
              Найти проблемы
            </button>
            <button type="button" onClick={() => void indexPending()} disabled={busy !== null}>
              {busy === 'index' ? (
                <Loader2 size={13} className="pw-spin" aria-hidden="true" />
              ) : (
                <Check size={13} aria-hidden="true" />
              )}
              Проиндексировать
            </button>
          </div>

          {indexMessage && <p className="pw-brain-detail-note">{indexMessage}</p>}

          {cleanup && (
            <div className="pw-brain-cleanup">
              <p className="pw-brain-detail-note">
                Проверено записей: {cleanup.scanned}. Кандидатов: {cleanup.candidates.length}.
                Ничего не удаляется; архив сохраняется.
              </p>
              {cleanup.candidates.length === 0 ? (
                <p className="pw-brain-detail-note">Очевидных проблем не найдено.</p>
              ) : (
                <ul>
                  {cleanup.candidates.slice(0, 10).map((candidate, index) => (
                    <li key={`${candidate.type}-${index}`}>
                      <strong>{candidate.title}</strong> · {candidate.type} ·{' '}
                      {candidate.safeToApply ? 'можно архивировать' : 'нужно решение'} —{' '}
                      {candidate.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
