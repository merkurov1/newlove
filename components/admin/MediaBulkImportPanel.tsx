'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type BulkProgress = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  duplicate: number;
  partial: number;
  failed: number;
  cancelled: number;
  done: boolean;
};

type BulkRow = {
  input?: string;
  inputUrl?: string;
  normalizedUrl: string | null;
  status?: string;
  jobStatus?: string;
  mediaRecordId?: string | null;
  title?: string | null;
  outlet?: string | null;
  publishedDate?: string | null;
  lang?: string | null;
  detectedLanguage?: string | null;
  kind?: string | null;
  topic?: string | null;
  archiveStatus?: string | null;
  coverageStatus?: string | null;
  textQuality?: string | null;
  extractionStatus?: string | null;
  ingestionStatus?: string | null;
  charCount?: number;
  chunkCount?: number;
  errorCode?: string | null;
  errorDetail?: string | null;
  reason?: string | null;
};

type BulkResponse = {
  runId: string | null;
  rows?: BulkRow[];
  progress?: BulkProgress | null;
  run?: { status?: string };
  error?: string;
};

const textareaClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 font-mono text-xs text-gray-900 outline-none focus:border-gray-500';

const buttonClass =
  'rounded-lg border border-gray-300 px-4 py-2 text-sm transition hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40';

const primaryButtonClass =
  'rounded-lg bg-[#990F3D] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#7E0C33] disabled:cursor-not-allowed disabled:opacity-40';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'completed':
    case 'queued':
      return 'border-green-200 bg-green-50 text-green-800';
    case 'processing':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case 'partial':
    case 'duplicate':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'failed':
    case 'blocked':
      return 'border-red-200 bg-red-50 text-red-800';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-600';
  }
}

function qualityLabel(value: string | null | undefined): string {
  switch (value) {
    case 'full_text':
      return 'Full text';
    case 'partial_text':
      return 'Partial text';
    case 'metadata_only':
      return 'Metadata only';
    case 'blocked':
      return 'Blocked';
    default:
      return '—';
  }
}

function ProgressBar({ progress }: { progress: BulkProgress | null }) {
  if (!progress) return null;

  const processed =
    progress.completed +
    progress.duplicate +
    progress.partial +
    progress.failed +
    progress.cancelled;
  const percent = progress.total > 0 ? Math.round((processed / progress.total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-500">
        <span>
          {processed} / {progress.total} обработано
        </span>
        <span>
          indexed {progress.completed} · duplicate {progress.duplicate} · partial {progress.partial}{' '}
          · failed {progress.failed}
        </span>
      </div>
      <div className="h-2 overflow-hidden bg-gray-100">
        <div
          className="h-full bg-[#990F3D] transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function MediaBulkImportPanel() {
  const [urlsText, setUrlsText] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [runStatus, setRunStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [message, setMessage] = useState('');
  const [recentRuns, setRecentRuns] = useState<
    Array<{ id: string; status: string; createdAt: string; source: string }>
  >([]);

  const urlCount = useMemo(
    () =>
      urlsText
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean).length,
    [urlsText]
  );

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/media-records/bulk', { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as {
        runs?: Array<{
          run?: {
            id?: string;
            status?: string;
            created_at?: string;
            metadata?: Record<string, unknown>;
          };
        }>;
      };

      if (!response.ok) return;

      setRecentRuns(
        (data.runs || [])
          .map((entry) => ({
            id: String(entry.run?.id || ''),
            status: String(entry.run?.status || ''),
            createdAt: String(entry.run?.created_at || ''),
            source: String(entry.run?.metadata?.source || ''),
          }))
          .filter((entry) => entry.id)
      );
    } catch {
      // History is optional; the main import flow still works.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const refreshStatus = useCallback(async (id: string): Promise<BulkResponse | null> => {
    const response = await fetch(`/api/admin/media-records/bulk/${id}`, {
      cache: 'no-store',
    });
    const data = (await response.json().catch(() => ({}))) as BulkResponse & {
      rows?: BulkRow[];
    };

    if (!response.ok) {
      throw new Error(data.error || 'Не удалось прочитать очередь.');
    }

    if (Array.isArray(data.rows)) setRows(data.rows);
    if (data.progress) setProgress(data.progress);
    if (data.run?.status) setRunStatus(data.run.status);

    return data;
  }, []);

  const processQueue = useCallback(
    async (id: string) => {
      setProcessing(true);
      setCancelled(false);
      setMessage('Обработка очереди…');

      let keepGoing = true;
      let iterations = 0;

      try {
        while (keepGoing && iterations < 2000) {
          iterations += 1;

          const response = await fetch(`/api/admin/brain/runs/${id}/next`, {
            method: 'POST',
          });
          const data = (await response.json().catch(() => ({}))) as {
            state?: string;
            runStatus?: string;
            progress?: BulkProgress;
            error?: string;
          };

          if (!response.ok) {
            throw new Error(data.error || 'Не удалось обработать следующую публикацию.');
          }

          if (data.progress) setProgress(data.progress);
          if (data.runStatus) setRunStatus(data.runStatus);

          await refreshStatus(id);

          if (data.state === 'done') {
            keepGoing = false;
            setMessage('Очередь завершена. Проверьте строки с partial/failed.');
          } else if (data.state === 'paused') {
            keepGoing = false;
            setMessage('Очередь приостановлена. Прогресс сохранён.');
          } else if (data.state === 'waiting') {
            await sleep(1500);
          }
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Ошибка обработки очереди.');
      } finally {
        setProcessing(false);
      }
    },
    [refreshStatus]
  );

  async function startBulk(): Promise<void> {
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/media-records/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsText }),
      });
      const data = (await response.json().catch(() => ({}))) as BulkResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось создать очередь.');
      }

      setRunId(data.runId);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setProgress(data.progress || null);
      setRunStatus('running');

      if (data.runId) {
        setMessage('Очередь создана. Запускаю последовательную обработку.');
        await processQueue(data.runId);
      } else {
        setMessage('Нет новых URL для постановки в очередь.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать очередь.');
    } finally {
      setBusy(false);
    }
  }

  async function pauseQueue(): Promise<void> {
    if (!runId) return;

    setBusy(true);
    setCancelled(true);

    try {
      const response = await fetch(`/api/admin/brain/runs/${runId}/pause`, {
        method: 'POST',
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) throw new Error(data.error || 'Не удалось приостановить очередь.');

      setRunStatus('paused');
      setMessage('Очередь приостановлена.');
      await refreshStatus(runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось приостановить очередь.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelQueue(): Promise<void> {
    if (!runId) return;

    setBusy(true);
    setCancelled(true);

    try {
      const response = await fetch(`/api/admin/media-records/bulk/${runId}/cancel`, {
        method: 'POST',
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) throw new Error(data.error || 'Не удалось отменить очередь.');

      setRunStatus('cancelled');
      setMessage('Очередь отменена.');
      await refreshStatus(runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отменить очередь.');
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed(): Promise<void> {
    if (!runId) return;

    setBusy(true);

    try {
      const response = await fetch(`/api/admin/media-records/bulk/${runId}/retry`, {
        method: 'POST',
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) throw new Error(data.error || 'Не удалось повторить ошибки.');

      setMessage('Неудачные задания возвращены в очередь.');
      await processQueue(runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось повторить ошибки.');
    } finally {
      setBusy(false);
    }
  }

  const isRunning = runStatus === 'running' || runStatus === 'paused';
  const canCancel = Boolean(runId) && runStatus !== 'cancelled' && runStatus !== 'completed';

  return (
    <section className="space-y-5 border-t border-gray-200 pt-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Bulk import</p>
          <h3 className="mt-2 font-serif text-2xl text-gray-950">Массовая загрузка публикаций</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Вставьте список URL. Публикации создаются только как draft; полный текст и качество
            извлечения определяются в общей Knowledge-очереди. Неудачные строки можно повторить,
            очередь — приостановить или отменить.
          </p>
        </div>
        <span className="text-xs text-gray-500">{urlCount} / 200 URL</span>
      </div>

      {recentRuns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>История:</span>
          {recentRuns.slice(0, 6).map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="rounded border border-gray-200 px-2 py-1 text-left hover:border-gray-500"
              onClick={() => {
                setRunId(entry.id);
                setRunStatus(entry.status);
                void refreshStatus(entry.id);
              }}
            >
              {entry.createdAt.slice(0, 16).replace('T', ' ')} · {entry.status}
            </button>
          ))}
        </div>
      )}

      <textarea
        className={textareaClass}
        rows={7}
        value={urlsText}
        onChange={(event) => setUrlsText(event.target.value)}
        placeholder={'https://example.com/article-1\nhttps://example.com/article-2'}
        disabled={processing}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => void startBulk()}
          disabled={busy || processing || urlCount === 0}
        >
          {busy || processing ? 'Обработка…' : 'Загрузить список'}
        </button>

        <button
          type="button"
          className={buttonClass}
          onClick={() => runId && void processQueue(runId)}
          disabled={busy || processing || !runId || runStatus === 'cancelled'}
        >
          Продолжить
        </button>

        <button
          type="button"
          className={buttonClass}
          onClick={() => void pauseQueue()}
          disabled={busy || !runId || !isRunning}
        >
          Пауза
        </button>

        <button
          type="button"
          className={buttonClass}
          onClick={() => void cancelQueue()}
          disabled={busy || !canCancel}
        >
          Отменить очередь
        </button>

        <button
          type="button"
          className={buttonClass}
          onClick={() => void retryFailed()}
          disabled={busy || processing || !runId}
        >
          Повторить ошибки
        </button>

        <button
          type="button"
          className={buttonClass}
          onClick={() => runId && void refreshStatus(runId)}
          disabled={busy || !runId}
        >
          Обновить
        </button>
      </div>

      {message && (
        <p className="text-sm text-gray-600" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <ProgressBar progress={progress} />

      {rows.length > 0 && (
        <div className="overflow-x-auto border border-gray-200">
          <table className="min-w-[1200px] w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Outlet</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Lang</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Topic</th>
                <th className="px-3 py-2">Quality</th>
                <th className="px-3 py-2">Chars</th>
                <th className="px-3 py-2">Chunks</th>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Archive</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const input = row.input || row.inputUrl || row.normalizedUrl || '';
                const jobStatus = row.jobStatus || row.status || '';
                const quality = row.textQuality || row.coverageStatus || '';

                return (
                  <tr key={`${input}-${index}`} className="border-t border-gray-100 align-top">
                    <td className="max-w-[240px] px-3 py-2">
                      <a
                        className="block truncate text-gray-600 underline"
                        href={input}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={input}
                      >
                        {input}
                      </a>
                      {row.errorDetail && (
                        <span className="mt-1 block text-[10px] text-red-700">
                          {row.errorDetail}
                        </span>
                      )}
                      {row.reason && (
                        <span className="mt-1 block text-[10px] text-gray-500">{row.reason}</span>
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2">{row.title || '—'}</td>
                    <td className="px-3 py-2">{row.outlet || '—'}</td>
                    <td className="px-3 py-2">{row.publishedDate || '—'}</td>
                    <td className="px-3 py-2">{row.detectedLanguage || row.lang || '—'}</td>
                    <td className="px-3 py-2">{row.kind || '—'}</td>
                    <td className="px-3 py-2">{row.topic || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex border px-2 py-0.5 ${statusClass(quality)}`}>
                        {qualityLabel(quality)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.charCount ?? 0}</td>
                    <td className="px-3 py-2">{row.chunkCount ?? 0}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex border px-2 py-0.5 ${statusClass(jobStatus)}`}>
                        {jobStatus || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.archiveStatus || 'draft'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
