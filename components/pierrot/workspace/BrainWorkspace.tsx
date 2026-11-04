'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText, Link2, Mic, Square, Upload, X } from 'lucide-react';
import type { BrainRecentSource } from '@/lib/pierrot/workspace/types';
import type { BrainSourcePreview } from '@/lib/knowledge/brain/sourceTypes';
import { readWorkspaceHandoff } from '@/lib/pierrot/workspace/handoff';
import { useOnlineStatus } from './useOnlineStatus';

type UiKind = 'url' | 'text' | 'pdf' | 'txt' | 'photo' | 'voice';
type BackendKind = 'url' | 'text' | 'pdf' | 'txt';

const KIND_LABELS: Array<{ key: UiKind; label: string }> = [
  { key: 'url', label: 'ссылка' },
  { key: 'text', label: 'текст' },
  { key: 'photo', label: 'фото' },
  { key: 'pdf', label: 'файл' },
  { key: 'voice', label: 'голос' },
];

function isBackendKind(kind: UiKind): kind is BackendKind {
  return kind === 'url' || kind === 'text' || kind === 'pdf' || kind === 'txt';
}

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

function sourceTypeLabel(source: BrainRecentSource): string {
  const value = source.sourceFormat || source.sourceType || 'источник';
  switch (value) {
    case 'url':
      return 'ссылка';
    case 'pdf':
      return 'PDF';
    case 'txt':
      return 'TXT';
    case 'text':
      return 'текст';
    case 'media_coverage':
      return 'медиа';
    default:
      return value;
  }
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
    | (T & { error?: string; message?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `Запрос не выполнен (${response.status}).`
    );
  }

  return payload as T;
}

export default function BrainWorkspace({ recent }: { recent: BrainRecentSource[] }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [kind, setKind] = useState<UiKind>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BrainSourcePreview | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [photo, setPhoto] = useState<{ name: string; url: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<{ url: string; seconds: number } | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recorderSupported, setRecorderSupported] = useState(false);

  const handoffRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => {
    setRecorderSupported(
      typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== 'undefined'
    );
  }, []);

  useEffect(() => {
    if (handoffRef.current) return;
    const handoff = readWorkspaceHandoff('brain');
    if (!handoff) return;

    handoffRef.current = true;
    setKind('text');
    setText(handoff);
    const timeout = window.setTimeout(() => {
      void previewSource('text', { text: handoff });
    }, 80);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  useEffect(() => {
    return () => {
      if (recorded) URL.revokeObjectURL(recorded.url);
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [recorded]);

  async function previewSource(
    nextKind: BackendKind,
    input: { url?: string; text?: string; file?: File }
  ) {
    setBusy('preview');
    setError(null);
    setMessage(null);
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

      const upload = await api<{ path: string; signedUrl: string }>(
        '/api/admin/brain/uploads',
        {
          method: 'POST',
          body: JSON.stringify({
            kind: nextKind,
            size: selected.size,
            mimeType: selected.type,
          }),
        }
      );

      const digest = await sha256File(selected);
      const uploadResponse = await fetch(upload.signedUrl, {
        method: 'PUT',
        body: selected,
        headers: {
          'Content-Type':
            selected.type || (nextKind === 'pdf' ? 'application/pdf' : 'text/plain'),
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

  function chooseKind(next: UiKind) {
    setKind(next);
    setError(null);
    setMessage(null);
    setPreview(null);
    setFile(null);
    setPhoto(null);
    setRecorded(null);
  }

  async function save() {
    if (!preview || !online) return;

    setBusy('save');
    setError(null);
    setMessage(null);

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
      const result = await api<{
        status: string;
        run: { id: string } | null;
        jobs: Array<{ id: string }>;
        skipped: Array<{ reason?: string }>;
      }>('/api/admin/brain/sources', {
        method: 'POST',
        body: JSON.stringify({ sources: [descriptor] }),
      });

      if (!result.run) {
        setMessage(
          `Источник не поставлен в очередь: ${
            result.skipped[0]?.reason || 'дубликат или пустой результат'
          }.`
        );
        return;
      }

      setMessage('Источник в очереди. Запускаю существующий Brain worker…');

      try {
        await api('/api/admin/brain/worker', {
          method: 'POST',
          body: JSON.stringify({ scope: 'brain', maxJobs: 1 }),
        });
        setMessage('Источник обработан существующим Brain worker. Список обновлён.');
      } catch (workerError) {
        setMessage(
          `Источник в очереди, но worker не завершился: ${
            workerError instanceof Error ? workerError.message : 'неизвестная ошибка'
          }.`
        );
      }

      setPreview(null);
      setUrl('');
      setText('');
      setFile(null);
      setLabel('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось поставить в очередь.');
    } finally {
      setBusy(null);
    }
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

    setError(null);
    setPreview(null);
    setKind(isPdf ? 'pdf' : 'txt');
    setFile(next);
  }

  async function startRecording() {
    setError(null);
    setMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      secondsRef.current = 0;
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (recorded) URL.revokeObjectURL(recorded.url);
        setRecorded({ url: URL.createObjectURL(blob), seconds: secondsRef.current });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
      };

      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setRecordingSeconds(secondsRef.current);
      }, 1000);
    } catch {
      setError('Микрофон недоступен или запись не разрешена браузером.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  return (
    <>
      <div className="pw-brain-form">
        <div className="pw-form-row" role="group" aria-label="Тип источника">
          {KIND_LABELS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="pw-chip"
              aria-pressed={kind === item.key}
              onClick={() => chooseKind(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {kind === 'url' && (
          <div style={{ marginTop: 20 }}>
            <label className="pw-label">
              Ссылка
              <input
                className="pw-input"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://"
              />
            </label>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="pw-button pw-button-primary"
                disabled={!online || busy !== null || !url.trim()}
                onClick={() => void previewSource('url', { url })}
              >
                <Link2 size={15} aria-hidden="true" />
                Проверить ссылку
              </button>
            </div>
          </div>
        )}

        {kind === 'text' && (
          <div style={{ marginTop: 20 }}>
            <label className="pw-label">
              Текст
              <textarea
                className="pw-textarea"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Вставьте текст, который нужно добавить в мозг"
                style={{ minHeight: 200 }}
              />
            </label>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="pw-button pw-button-primary"
                disabled={!online || busy !== null || !text.trim()}
                onClick={() => void previewSource('text', { text })}
              >
                <FileText size={15} aria-hidden="true" />
                Проверить текст
              </button>
            </div>
          </div>
        )}

        {(kind === 'pdf' || kind === 'txt') && (
          <div style={{ marginTop: 20 }}>
            <label
              className="pw-dropzone"
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
                accept=".pdf,.txt,.md,application/pdf,text/plain"
                className="sr-only"
                onChange={(event) => acceptFile(event.target.files?.[0] || null)}
              />
              <span className="pw-section-title">PDF или TXT</span>
              <span style={{ fontSize: 19 }}>
                {file ? file.name : 'Выберите файл или перетащите его сюда'}
              </span>
              <span className="pw-dropzone-hint">
                {file
                  ? `${Math.round(file.size / 1024)} KB · загрузка в приватное хранилище`
                  : 'до 25 MB PDF · до 5 MB TXT'}
              </span>
              <span className="pw-button pw-button-small" style={{ marginTop: 8 }}>
                <Upload size={14} aria-hidden="true" />
                Выбрать файл
              </span>
            </label>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="pw-button pw-button-primary"
                disabled={!online || busy !== null || !file}
                onClick={() => void previewSource(kind, { file: file || undefined })}
              >
                <Upload size={15} aria-hidden="true" />
                Загрузить и проверить
              </button>
            </div>
          </div>
        )}

        {kind === 'photo' && (
          <div style={{ marginTop: 20 }}>
            <label className="pw-dropzone">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  if (photo) URL.revokeObjectURL(photo.url);
                  setPhoto({ name: selected.name, url: URL.createObjectURL(selected) });
                  setError(null);
                }}
              />
              <span className="pw-section-title">Фото</span>
              <span style={{ fontSize: 19 }}>
                {photo ? photo.name : 'Выберите изображение'}
              </span>
              <span className="pw-dropzone-hint">локальный preview · без загрузки</span>
            </label>

            <div className="pw-notice pw-notice-warning">
              Brain ingestion сейчас принимает только URL, PDF, TXT и текст. Изображение
              показывается локально и не добавляется в базу. Для фото нужна отдельная
              backend-поддержка.
            </div>

            {photo && (
              <div className="pw-media-local">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Локальный preview выбранного фото" />
              </div>
            )}
          </div>
        )}

        {kind === 'voice' && (
          <div style={{ marginTop: 20 }}>
            <div className="pw-notice">
              {recorderSupported
                ? 'Запись идёт только в браузере. Backend-транскрибация не подключена, поэтому аудио не попадает в Brain.'
                : 'Этот браузер не поддерживает запись аудио.'}
            </div>

            <div className="pw-form-row" style={{ marginTop: 12 }}>
              {!recording ? (
                <button
                  type="button"
                  className="pw-button"
                  onClick={() => void startRecording()}
                  disabled={!recorderSupported}
                >
                  <Mic size={15} aria-hidden="true" />
                  Записать
                </button>
              ) : (
                <button type="button" className="pw-button pw-button-danger" onClick={stopRecording}>
                  <Square size={14} aria-hidden="true" />
                  Остановить · {recordingSeconds}s
                </button>
              )}
            </div>

            {recorded && (
              <div className="pw-media-local">
                <p className="pw-kicker">Локальная запись · {recorded.seconds}s</p>
                <audio controls src={recorded.url} />
              </div>
            )}
          </div>
        )}

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

        {preview && (
          <div className="pw-preview-card">
            <span className="pw-source-type">
              {preview.kind} · {preview.sourceFormat}
            </span>
            <h2 className="pw-preview-card-title">{preview.title || 'Без названия'}</h2>
            <p className="pw-preview-card-meta">
              {[preview.author, preview.publishedAt?.slice(0, 10), preview.language]
                .filter(Boolean)
                .join(' · ') || 'метаданные не распознаны'}
            </p>
            <p className="pw-preview-card-meta">
              {preview.chunkCount} chunks · {preview.wordCount} слов
              {preview.pageCount ? ` · ${preview.pageCount} стр.` : ''}
            </p>

            {preview.duplicate && (
              <div className="pw-notice pw-notice-warning">
                Похожий источник уже есть: {preview.duplicate.title} ({preview.duplicate.match}).
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="pw-notice">{preview.warnings.join(' · ')}</div>
            )}

            <label className="pw-label" style={{ marginTop: 16 }}>
              Предложенная метка
              <input
                className="pw-tag-input"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={preview.title || 'Название источника'}
                aria-label="Предложенная метка источника"
              />
            </label>

            {preview.excerpt && (
              <p className="pw-preview-excerpt">{preview.excerpt}</p>
            )}

            <div className="pw-form-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="pw-button pw-button-primary"
                onClick={() => void save()}
                disabled={!online || busy !== null}
              >
                <Check size={15} aria-hidden="true" />
                {busy === 'save' ? 'Сохраняю…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="pw-button"
                onClick={() => setPreview(null)}
                disabled={busy !== null}
              >
                <X size={14} aria-hidden="true" />
                Отменить preview
              </button>
            </div>
          </div>
        )}

        {busy === 'preview' && (
          <p className="pw-kicker" role="status" style={{ marginTop: 16 }}>
            Проверяю источник…
          </p>
        )}
      </div>

      <section className="pw-recent" aria-label="Последние добавления">
        <h2 className="pw-section-title">Последние добавления</h2>
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
