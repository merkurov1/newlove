'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, FileText, Link2, Upload, X } from 'lucide-react';
import type { BrainRecentSource } from '@/lib/pierrot/workspace/types';
import type { BrainSourcePreview } from '@/lib/knowledge/brain/sourceTypes';
import { BRAIN_SOURCE_LIMITS } from '@/lib/knowledge/brain/sourceTypes';
import { readWorkspaceHandoff } from '@/lib/pierrot/workspace/handoff';
import { useOnlineStatus } from './useOnlineStatus';

type BackendKind = 'url' | 'text' | 'pdf' | 'txt';

type ResultTone = 'success' | 'warning' | 'error';

type IngestionResult = {
  tone: ResultTone;
  title: string;
  detail: string;
  classification?: string;
};

type ProcessResponse =
  | {
      state: 'processed';
      job?: {
        status?: string;
        title?: string | null;
        extraction_status?: string | null;
        error_detail?: string | null;
      };
    }
  | { state: 'waiting' }
  | { state: 'done' }
  | { state: 'paused' };

const FILE_ACCEPT = '.pdf,.txt,.md,application/pdf,text/plain';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function jobStatusLabel(status: string | null): string {
  switch (status) {
    case 'queued':
      return 'в очереди';
    case 'processing':
      return 'обработка';
    case 'completed':
      return 'готово';
    case 'duplicate':
      return 'дубликат';
    case 'partial':
      return 'частично';
    case 'failed':
      return 'ошибка';
    case 'cancelled':
      return 'отменено';
    default:
      return status || '—';
  }
}

export function classificationLabel(sourceType: string | null | undefined): string {
  if (sourceType === 'media_coverage') return 'Media archive';
  if (sourceType === 'pdf' || sourceType === 'txt' || sourceType === 'text') {
    return 'Brain knowledge';
  }
  if (sourceType === 'article') return 'Brain knowledge';
  return 'Brain knowledge';
}

export function formatLabel(value: string | null | undefined): string {
  switch (value) {
    case 'url':
      return 'URL';
    case 'pdf':
      return 'PDF';
    case 'txt':
      return 'TXT';
    case 'text':
      return 'текст';
    case 'markdown':
      return 'markdown';
    default:
      return value || 'источник';
  }
}

function sourceTypeLabel(source: BrainRecentSource): string {
  const classification = classificationLabel(source.sourceType);
  const format = formatLabel(source.sourceFormat || source.sourceType);
  return `${classification} · ${format}`;
}

async function sha256File(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Браузер не предоставляет SHA-256. Загрузка файла недоступна.');
  }

  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function api<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string; message?: string }) | null;

  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `Запрос не выполнен (${response.status}).`
    );
  }

  return payload as T;
}

export function isSingleUrl(value: string): boolean {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length === 1 && /^https?:\/\/\S+$/i.test(lines[0]);
}

export function looksLikeMultipleUrls(value: string): boolean {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 1 && lines.every((line) => /^https?:\/\/\S+$/i.test(line));
}

export function kindFromFile(file: File): 'pdf' | 'txt' {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'pdf' || file.type === 'application/pdf' ? 'pdf' : 'txt';
}

export default function BrainWorkspace({ recent }: { recent: BrainRecentSource[] }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [sourceText, setSourceText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BrainSourcePreview | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const handoffRef = useRef(false);

  const fileKind = file ? kindFromFile(file) : null;
  const detectedKind: BackendKind | 'multi-url' | null = fileKind
    ? fileKind
    : looksLikeMultipleUrls(sourceText)
      ? 'multi-url'
      : isSingleUrl(sourceText)
        ? 'url'
        : sourceText.trim()
          ? 'text'
          : null;

  const detectedLabel =
    detectedKind === 'url'
      ? 'Ссылка'
      : detectedKind === 'text'
        ? 'Текст'
        : detectedKind === 'pdf'
          ? 'PDF'
          : detectedKind === 'txt'
            ? 'TXT'
            : detectedKind === 'multi-url'
              ? 'Несколько ссылок'
              : 'Источник';

  useEffect(() => {
    if (handoffRef.current) return;
    const handoff = readWorkspaceHandoff('brain');
    if (!handoff) return;

    handoffRef.current = true;
    setSourceText(handoff);
    const timeout = window.setTimeout(() => {
      void previewSource('text', { text: handoff });
    }, 80);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetDraft() {
    setSourceText('');
    setFile(null);
    setLabel('');
    setPreview(null);
  }

  function changeText(value: string) {
    setSourceText(value);
    if (file) setFile(null);
    if (preview) setPreview(null);
    if (error) setError(null);
    if (result) setResult(null);
  }

  function acceptFile(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }

    const extension = next.name.split('.').pop()?.toLowerCase();
    const isPdf = extension === 'pdf' || next.type === 'application/pdf';
    const isTxt = extension === 'txt' || extension === 'md' || next.type === 'text/plain';

    if (!isPdf && !isTxt) {
      setError('Поддерживаются только PDF и TXT.');
      return;
    }

    const kind = isPdf ? 'pdf' : 'txt';
    const limit =
      kind === 'pdf' ? BRAIN_SOURCE_LIMITS.maxPdfBytes : BRAIN_SOURCE_LIMITS.maxTxtBytes;

    if (next.size > limit) {
      setError(
        kind === 'pdf'
          ? 'PDF больше 25 MB. Уменьшите файл перед загрузкой.'
          : 'TXT больше 5 MB. Уменьшите файл перед загрузкой.'
      );
      return;
    }

    setError(null);
    setResult(null);
    setPreview(null);
    setSourceText('');
    setFile(next);
  }

  async function previewSource(
    nextKind: BackendKind,
    input: { url?: string; text?: string; file?: File }
  ) {
    setBusy('preview');
    setError(null);
    setResult(null);
    setPreview(null);

    try {
      if (nextKind === 'url') {
        const data = await api<{ preview: BrainSourcePreview }>('/api/admin/brain/preview', {
          method: 'POST',
          body: JSON.stringify({ kind: 'url', url: input.url || '' }),
        });
        setPreview(data.preview);
        setLabel(data.preview.title || '');
        return;
      }

      if (nextKind === 'text') {
        const data = await api<{ preview: BrainSourcePreview }>('/api/admin/brain/preview', {
          method: 'POST',
          body: JSON.stringify({ kind: 'text', text: input.text || '' }),
        });
        setPreview(data.preview);
        setLabel(data.preview.title || '');
        return;
      }

      const selected = input.file;
      if (!selected) throw new Error('Выберите PDF или TXT файл.');

      const upload = await api<{ path: string; signedUrl: string }>('/api/admin/brain/uploads', {
        method: 'POST',
        body: JSON.stringify({
          kind: nextKind,
          size: selected.size,
          mimeType: selected.type,
        }),
      });

      const digest = await sha256File(selected);
      const uploadResponse = await fetch(upload.signedUrl, {
        method: 'PUT',
        body: selected,
        headers: {
          'Content-Type': selected.type || (nextKind === 'pdf' ? 'application/pdf' : 'text/plain'),
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Файл не загрузился в приватное хранилище.');
      }

      const data = await api<{ preview: BrainSourcePreview }>('/api/admin/brain/preview', {
        method: 'POST',
        body: JSON.stringify({
          kind: nextKind,
          storagePath: upload.path,
          sourceSha256: digest,
          originalFilename: selected.name,
          mimeType: selected.type || (nextKind === 'pdf' ? 'application/pdf' : 'text/plain'),
          byteSize: selected.size,
        }),
      });

      setPreview(data.preview);
      setLabel(data.preview.title || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview не удался.');
    } finally {
      setBusy(null);
    }
  }

  async function checkSource() {
    if (!online || busy !== null) return;

    if (detectedKind === 'multi-url') {
      setError(
        'Добавьте по одной ссылке за раз. Для пакетной загрузки используйте Brain Injection.'
      );
      return;
    }

    if (fileKind && file) {
      await previewSource(fileKind, { file });
      return;
    }

    if (detectedKind === 'url') {
      await previewSource('url', { url: sourceText.trim() });
      return;
    }

    if (detectedKind === 'text') {
      await previewSource('text', { text: sourceText });
      return;
    }

    setError('Вставьте ссылку или текст, либо выберите PDF / TXT.');
  }

  async function save() {
    if (!preview || !online) return;

    setBusy('save');
    setError(null);
    setResult(null);

    const title = label.trim() || preview.title || null;
    const descriptor = {
      kind: preview.kind,
      ...(preview.kind === 'url'
        ? { url: preview.normalizedUrl }
        : {
            storagePath: preview.storagePath || preview.sourcePath,
            sourceSha256: preview.sourceSha256,
            originalFilename: preview.originalFilename,
            mimeType: preview.mimeType,
            byteSize: preview.byteSize,
            pageCount: preview.pageCount,
          }),
      title,
      author: preview.author || null,
      publishedAt: preview.publishedAt || null,
      language: preview.language || null,
    };

    try {
      const queued = await api<{
        run: { id: string } | null;
        jobs: Array<{ id: string }>;
        skipped: Array<{ reason?: string }>;
      }>('/api/admin/brain/sources', {
        method: 'POST',
        body: JSON.stringify({ sources: [descriptor] }),
      });

      if (!queued.run) {
        setResult({
          tone: 'warning',
          title: 'Не добавлено',
          detail:
            queued.skipped[0]?.reason ||
            'Источник уже есть в Brain или совпадает с существующим документом.',
          classification: `${classificationLabel(preview.sourceType)} · ${formatLabel(
            preview.sourceFormat
          )}`,
        });
        setPreview(null);
        return;
      }

      let processed: ProcessResponse | null = null;
      let workerError = false;

      try {
        processed = await api<ProcessResponse>(`/api/admin/brain/runs/${queued.run.id}/next`, {
          method: 'POST',
          body: JSON.stringify({ autoGraph: false }),
        });
      } catch {
        workerError = true;
      }

      const jobStatus =
        processed && processed.state === 'processed' ? processed.job?.status || 'queued' : 'queued';
      const classification = `${classificationLabel(preview.sourceType)} · ${formatLabel(
        preview.sourceFormat
      )}`;
      const displayTitle = title || preview.title || 'Источник';

      if (jobStatus === 'completed') {
        setResult({
          tone: 'success',
          title: 'Добавлено в Brain',
          detail: `${displayTitle} — проиндексировано и доступно Pierrot.`,
          classification,
        });
      } else if (jobStatus === 'duplicate') {
        setResult({
          tone: 'warning',
          title: 'Источник уже в Brain',
          detail: `${displayTitle} — совпадает с существующим документом. Новый дубликат не создан.`,
          classification,
        });
      } else if (jobStatus === 'failed' || jobStatus === 'partial') {
        const diagnosis =
          processed && processed.state === 'processed' ? processed.job?.error_detail : null;
        setResult({
          tone: 'error',
          title: jobStatus === 'partial' ? 'Добавлено частично' : 'Не удалось добавить',
          detail:
            diagnosis ||
            'Обработка не завершилась. Источник остался в очереди — его можно повторить в Brain Injection.',
          classification,
        });
      } else if (workerError) {
        setResult({
          tone: 'warning',
          title: 'Источник в очереди',
          detail:
            'Сохранение принято, но обработчик сейчас не ответил. Существующая очередь завершит его в фоне.',
          classification,
        });
      } else {
        setResult({
          tone: 'warning',
          title: 'Источник в очереди',
          detail: `${displayTitle} ожидает обработки. Очередь продолжит работу без открытой вкладки.`,
          classification,
        });
      }

      resetDraft();
      router.refresh();
    } catch (caught) {
      setResult({
        tone: 'error',
        title: 'Не удалось сохранить',
        detail: caught instanceof Error ? caught.message : 'Запрос не выполнен.',
        classification: `${classificationLabel(preview.sourceType)} · ${formatLabel(
          preview.sourceFormat
        )}`,
      });
    } finally {
      setBusy(null);
    }
  }

  const canCheck =
    online &&
    busy === null &&
    (Boolean(file) ||
      detectedKind === 'url' ||
      detectedKind === 'text' ||
      detectedKind === 'multi-url');

  return (
    <>
      <section className="pw-brain-composer" aria-labelledby="pw-brain-composer-title">
        <div className="pw-brain-composer-head">
          <h2 id="pw-brain-composer-title" className="pw-section-title">
            Новый источник
          </h2>
          <span className="pw-brain-detected">{detectedLabel}</span>
        </div>

        <textarea
          className="pw-brain-input"
          value={sourceText}
          onChange={(event) => changeText(event.target.value)}
          placeholder="Вставьте ссылку или текст…"
          rows={5}
          spellCheck={false}
          aria-label="Ссылка или текст для добавления в Brain"
        />

        <div className="pw-brain-or" aria-hidden="true">
          <span>или</span>
        </div>

        <label
          className="pw-dropzone pw-brain-dropzone"
          data-dragging={dragging ? 'true' : 'false'}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files?.[0] || null);
          }}
        >
          <input
            type="file"
            accept={FILE_ACCEPT}
            className="sr-only"
            onChange={(event) => acceptFile(event.target.files?.[0] || null)}
          />
          {file ? (
            <>
              <span className="pw-brain-file-row">
                <FileText size={18} strokeWidth={1.4} aria-hidden="true" />
                <span className="pw-brain-file-name">{file.name}</span>
              </span>
              <span className="pw-dropzone-hint">
                {Math.round(file.size / 1024)} KB · нажмите, чтобы заменить
              </span>
            </>
          ) : (
            <>
              <span className="pw-brain-file-row">
                <Upload size={18} strokeWidth={1.4} aria-hidden="true" />
                <span className="pw-brain-file-name">PDF или TXT</span>
              </span>
              <span className="pw-dropzone-hint">
                Перетащите файл сюда · до 25 MB PDF · до 5 MB TXT
              </span>
            </>
          )}
        </label>

        {file && (
          <button type="button" className="pw-brain-clear-file" onClick={() => setFile(null)}>
            <X size={13} aria-hidden="true" />
            Убрать файл
          </button>
        )}

        <div className="pw-brain-actions">
          <button
            type="button"
            className="pw-button pw-button-primary"
            onClick={() => void checkSource()}
            disabled={!canCheck || busy !== null}
          >
            {busy === 'preview' ? (
              'Проверяю…'
            ) : detectedKind === 'url' ? (
              <>
                <Link2 size={15} aria-hidden="true" />
                Проверить ссылку
              </>
            ) : (
              <>
                <Check size={15} aria-hidden="true" />
                Проверить источник
              </>
            )}
          </button>
          <span className="pw-brain-hint">Сначала preview, затем сохранение</span>
        </div>
      </section>

      {error && (
        <div className="pw-notice pw-notice-warning" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className={`pw-brain-result is-${result.tone}`} role="status">
          <span className="pw-brain-result-title">{result.title}</span>
          <p>{result.detail}</p>
          {result.classification && (
            <span className="pw-brain-result-meta">
              {result.classification} · классификация автоматическая
            </span>
          )}
        </div>
      )}

      {preview && (
        <section className="pw-preview-card" aria-label="Проверка источника">
          <div className="pw-brain-preview-top">
            <div style={{ minWidth: 0 }}>
              <span className="pw-source-type">
                {classificationLabel(preview.sourceType)} · {formatLabel(preview.sourceFormat)}
              </span>
              <h2 className="pw-preview-card-title">{preview.title || 'Без названия'}</h2>
              <p className="pw-preview-card-meta">
                {[preview.author, preview.publishedAt?.slice(0, 10), preview.language]
                  .filter(Boolean)
                  .join(' · ') || 'метаданные не распознаны'}
              </p>
            </div>
            <span className="pw-brain-preview-stats">
              {preview.pageCount ? `${preview.pageCount} стр. · ` : ''}
              {preview.wordCount} слов
            </span>
          </div>

          {preview.duplicate && (
            <div className="pw-notice pw-notice-warning">
              Похожий источник уже есть: {preview.duplicate.title} ({preview.duplicate.match}).
              Повторное добавление не создаст дубликат.
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="pw-notice">{preview.warnings.join(' · ')}</div>
          )}

          <label className="pw-label pw-brain-label">
            Название
            <input
              className="pw-tag-input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={preview.title || 'Название источника'}
              aria-label="Название источника"
            />
          </label>

          {preview.excerpt && (
            <details className="pw-brain-excerpt">
              <summary>Проверить извлечённый текст</summary>
              <p className="pw-preview-excerpt">{preview.excerpt}</p>
            </details>
          )}

          <div className="pw-form-row" style={{ marginTop: 18 }}>
            <button
              type="button"
              className="pw-button pw-button-primary"
              onClick={() => void save()}
              disabled={!online || busy !== null}
            >
              <Check size={15} aria-hidden="true" />
              {busy === 'save' ? 'Сохраняю…' : 'Добавить в Brain'}
            </button>
            <button
              type="button"
              className="pw-button"
              onClick={() => setPreview(null)}
              disabled={busy !== null}
            >
              <X size={14} aria-hidden="true" />
              Отменить
            </button>
          </div>
        </section>
      )}

      <section className="pw-recent" aria-label="Последние добавления">
        <div className="pw-brain-recent-head">
          <h2 className="pw-section-title">Последние добавления</h2>
          <Link className="pw-brain-journal-link" href="/admin/brain">
            Журнал очереди
            <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="pw-notice">Добавлений пока нет.</p>
        ) : (
          <ul className="pw-recent-list">
            {recent.map((item) => (
              <li key={item.id} className="pw-recent-row">
                <div style={{ minWidth: 0 }}>
                  <div className="pw-recent-title">{item.title || 'Без названия'}</div>
                  <div className="pw-recent-meta">
                    {sourceTypeLabel(item)} · {formatDate(item.createdAt)}
                    {item.errorCode ? ` · ${item.errorCode}` : ''}
                  </div>
                </div>
                <div className="pw-recent-status">{jobStatusLabel(item.status)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
