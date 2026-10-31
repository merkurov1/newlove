'use client';

import { useEffect, useState } from 'react';

import MediaBulkImportPanel from '@/components/admin/MediaBulkImportPanel';

type RecordStatus = 'draft' | 'published';

type MediaSourceKind = 'url' | 'pdf' | 'txt' | 'text';

type MediaSourceDescriptor = {
  kind: MediaSourceKind;
  format: string;
  storagePath: string;
  sourceSha256: string;
  contentHash: string;
  originalFilename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
};

type MediaRecord = {
  id?: string;
  url: string;
  canonical_url?: string;
  title: string;
  outlet: string;
  author?: string | null;
  source_format?: string | null;
  content_hash?: string | null;
  source_path?: string | null;
  source_sha256?: string | null;
  extraction_diagnostics?: Record<string, unknown>;
  indexing_status?: string | null;
  indexing_error?: string | null;
  published_date: string | null;
  lang: string;
  kind: string;
  topic: string;
  summary: string;
  image_url: string | null;
  status?: RecordStatus;
  ai_metadata?: Record<string, unknown>;
  coverage?: {
    documentId: string;
    coverageStatus: string | null;
    textQuality: string | null;
    extractionStatus: string | null;
    ingestionStatus: string | null;
    chunkCount: number;
    sourceCharCount: number;
    language: string | null;
    processedAt: string | null;
  } | null;
  latest_job?: {
    id: string;
    status: string;
    errorCode: string | null;
    errorDetail: string | null;
    processedAt: string | null;
  } | null;
};

type ExtractionSummary = {
  quality?: string;
  coverageStatus?: string;
  extractionStatus?: string;
  errorCode?: string | null;
  charCount?: number;
  wordCount?: number;
  chunkCount?: number;
  languageDetected?: string;
  paywallDetected?: boolean;
  truncated?: boolean;
  parser?: string;
  fetchedBytes?: number;
  finalUrl?: string | null;
  pageCount?: number | null;
  skippedPages?: number[];
  sourceFormat?: string;
  contentHash?: string;
  sourceSha256?: string;
};

type ApiResponse = {
  record?: MediaRecord;
  records?: MediaRecord[];
  extraction?: ExtractionSummary;
  source?: MediaSourceDescriptor | null;
  updated?: boolean;
  duplicate?: {
    id: string;
    title: string;
    status: string;
    canonical_url: string;
    coverage?: {
      documentId: string;
      coverageStatus: string | null;
      ingestionStatus: string | null;
      chunkCount: number | null;
    } | null;
  } | null;
  warning?: string | null;
  coverage?: {
    status: string;
    runId?: string;
    jobId?: string;
    error?: string;
  } | null;
  error?: string;
};

const kinds = ['quote', 'mention', 'interview', 'radio', 'video', 'column', 'blog', 'profile'];

const topics = ['Internet & Censorship', 'AI & Tech', 'Art & Culture', 'Fintech & Crypto'];

const langs = [
  'EN',
  'RU',
  'DE',
  'PL',
  'BS',
  'FR',
  'IT',
  'ES',
  'PT',
  'NL',
  'CS',
  'TR',
  'UK',
  'SR',
  'HR',
];

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-500';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);

  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

const sourceLabels: Record<MediaSourceKind, string> = {
  url: 'URL публикации',
  pdf: 'PDF публикации',
  txt: 'TXT с текстом',
  text: 'Ручная вставка текста',
};

function sourceLabel(value: string | null | undefined): string {
  if (value === 'pdf') return 'PDF';
  if (value === 'txt') return 'TXT';
  if (value === 'text') return 'Manual text';
  if (value === 'url') return 'URL';
  return 'not indexed';
}

async function readResponse(response: Response): Promise<ApiResponse> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    throw new Error('Сервер вернул некорректный ответ.');
  }
}

export default function MediaLinksPanel() {
  const [mode, setMode] = useState<MediaSourceKind>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [record, setRecord] = useState<MediaRecord | null>(null);
  const [source, setSource] = useState<MediaSourceDescriptor | null>(null);
  const [extraction, setExtraction] = useState<ExtractionSummary | null>(null);
  const [duplicate, setDuplicate] = useState<ApiResponse['duplicate']>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [records, setRecords] = useState<MediaRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadRecords(): Promise<void> {
    try {
      const response = await fetch('/api/admin/media-records', {
        cache: 'no-store',
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось загрузить записи.');
      }

      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, 'Не удалось загрузить записи.'));
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  function resetPreview(): void {
    setRecord(null);
    setSource(null);
    setExtraction(null);
    setDuplicate(null);
    setWarning(null);
  }

  async function uploadFile(): Promise<{
    storagePath: string;
    sourceSha256: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
  }> {
    if (!file) throw new Error('Выберите файл.');

    const uploadResponse = await fetch('/api/admin/media-records/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: mode,
        size: file.size,
        mimeType: file.type,
      }),
    });
    const upload = (await uploadResponse.json().catch(() => ({}))) as {
      path?: string;
      signedUrl?: string;
      error?: string;
      message?: string;
    };

    if (!uploadResponse.ok || !upload.path || !upload.signedUrl) {
      throw new Error(upload.message || upload.error || 'Не удалось подготовить загрузку файла.');
    }

    const digest = await sha256File(file);
    const put = await fetch(upload.signedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || (mode === 'pdf' ? 'application/pdf' : 'text/plain'),
      },
    });

    if (!put.ok) throw new Error('Не удалось загрузить файл в приватное хранилище.');

    return {
      storagePath: upload.path,
      sourceSha256: digest,
      originalFilename: file.name,
      mimeType: file.type || (mode === 'pdf' ? 'application/pdf' : 'text/plain'),
      byteSize: file.size,
    };
  }

  async function previewSource(): Promise<void> {
    const submittedUrl = url.trim();

    if (!submittedUrl) {
      setMessage('Введите исходный URL публикации.');
      return;
    }

    if (mode === 'text' && !text.trim()) {
      setMessage('Вставьте доступный вам полный текст публикации.');
      return;
    }

    if ((mode === 'pdf' || mode === 'txt') && !file) {
      setMessage(`Выберите ${mode.toUpperCase()} файл.`);
      return;
    }

    setBusy(true);
    setMessage('');
    resetPreview();

    try {
      let sourceInput: Record<string, unknown> = {
        kind: mode,
        url: submittedUrl,
      };

      if (mode === 'text') {
        sourceInput.text = text;
      } else if (mode === 'pdf' || mode === 'txt') {
        const uploaded = await uploadFile();
        sourceInput = {
          ...sourceInput,
          storagePath: uploaded.storagePath,
          sourceSha256: uploaded.sourceSha256,
          originalFilename: uploaded.originalFilename,
          mimeType: uploaded.mimeType,
          byteSize: uploaded.byteSize,
        };
      }

      const response = await fetch('/api/admin/media-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          url: submittedUrl,
          source: sourceInput,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось подготовить preview.');
      }

      if (!data.record || !data.source) {
        throw new Error('Сервер не вернул данные публикации.');
      }

      setRecord(data.record);
      setSource(data.source);
      setExtraction(data.extraction || null);
      setDuplicate(data.duplicate || null);
      setWarning(data.warning || null);
      setMessage(
        [
          'Preview готов. Проверьте метаданные и качество текста перед сохранением.',
          data.extraction
            ? `Качество: ${data.extraction.quality || '—'}, символов: ${data.extraction.charCount ?? 0}, слов: ${data.extraction.wordCount ?? 0}, chunks: ${data.extraction.chunkCount ?? 0}.`
            : '',
          data.duplicate
            ? `Найдена существующая запись: ${data.duplicate.title}. Сохранение обновит её, а не создаст дубль.`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, 'Не удалось подготовить preview.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveRecord(status: RecordStatus): Promise<void> {
    if (!record) return;

    if (!record.title.trim() || !record.outlet.trim()) {
      setMessage('Заполните заголовок и название издания.');
      return;
    }

    if (!source) {
      setMessage('Сначала выполните preview источника.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/media-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          ...record,
          url: record.url || url.trim(),
          source,
          extraction,
          status,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось сохранить запись.');
      }

      const coverageMessage = data.coverage
        ? data.coverage.status === 'failed'
          ? data.coverage.error || 'Очередь Knowledge не создана.'
          : `Knowledge job: ${data.coverage.status}.`
        : '';

      setMessage(
        [
          data.updated ? 'Существующая запись обновлена.' : 'Публикация сохранена.',
          coverageMessage,
          'Публикация и индексация имеют независимые статусы: проверьте indexing status ниже.',
        ]
          .filter(Boolean)
          .join(' ')
      );

      resetPreview();
      setText('');
      setFile(null);
      await loadRecords();
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, 'Не удалось сохранить запись.'));
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof MediaRecord>(field: K, value: MediaRecord[K]): void {
    setRecord((current) => (current ? { ...current, [field]: value } : current));
  }

  return (
    <section className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Editorial archive</p>

        <h2 className="mt-2 font-serif text-3xl text-gray-950">Media publications</h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Добавление интервью, цитирований, колонок и других подтверждённых публикаций.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(sourceLabels) as MediaSourceKind[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setFile(null);
                resetPreview();
              }}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                mode === value
                  ? 'border-[#990F3D] bg-[#990F3D] text-white'
                  : 'border-gray-300 text-gray-700 hover:border-gray-500'
              }`}
            >
              {sourceLabels[value]}
            </button>
          ))}
        </div>

        <label htmlFor="media-publication-url" className="mt-4 mb-2 block text-sm font-medium">
          Исходный URL публикации
        </label>
        <input
          id="media-publication-url"
          className={inputClass}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://publication.com/article"
          type="url"
          autoComplete="url"
        />

        {mode === 'text' && (
          <label className="mt-4 block text-sm">
            Полный доступный вам текст
            <textarea
              className={`${inputClass} mt-1 font-mono text-xs`}
              rows={10}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Вставьте текст, к которому у вас есть законный доступ. Paywall не обходится."
            />
          </label>
        )}

        {(mode === 'pdf' || mode === 'txt') && (
          <label className="mt-4 block text-sm">
            {mode === 'pdf' ? 'PDF публикации' : 'TXT с текстом публикации'}
            <input
              type="file"
              accept={mode === 'pdf' ? 'application/pdf,.pdf' : 'text/plain,.txt'}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="mt-1 block w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm"
            />
          </label>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void previewSource()}
            disabled={busy || !url.trim()}
            className="rounded-lg bg-[#990F3D] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#7E0C33] disabled:opacity-40"
          >
            {busy ? 'Обработка…' : 'Preview источника'}
          </button>
          <span className="text-xs text-gray-500">
            URL скачивается один раз. Save и очередь используют уже сохранённый источник.
          </span>
        </div>

        {message && (
          <p className="mt-3 text-sm text-gray-600" role="status" aria-live="polite">
            {message}
          </p>
        )}

        {warning && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {warning}
          </p>
        )}
      </div>

      {record && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-gray-500">
                Preview / editable record
              </p>

              <h3 className="mt-1 break-words font-serif text-2xl">
                {record.outlet || 'Новое издание'}
              </h3>
            </div>

            {record.image_url && (
              <img
                src={record.image_url}
                alt=""
                className="h-20 w-28 shrink-0 rounded object-cover"
                referrerPolicy="no-referrer"
              />
            )}
          </div>

          <div className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
            <p>
              Источник: <strong>{sourceLabel(source?.format || record.source_format)}</strong>
            </p>
            <p>
              Качество: <strong>{extraction?.quality || '—'}</strong>
            </p>
            <p>
              Символов: <strong>{extraction?.charCount ?? 0}</strong> · слов:{' '}
              <strong>{extraction?.wordCount ?? 0}</strong>
            </p>
            <p>
              Chunks: <strong>{extraction?.chunkCount ?? 0}</strong>
            </p>
            <p>
              Paywall: <strong>{extraction?.paywallDetected ? 'yes' : 'no'}</strong>
            </p>
            <p>
              Truncation: <strong>{extraction?.truncated ? 'yes' : 'no'}</strong>
            </p>
            <p>
              Pages: <strong>{extraction?.pageCount ?? '—'}</strong>
            </p>
            <p>
              Error: <strong>{extraction?.errorCode || '—'}</strong>
            </p>
            <p>
              Brain status:{' '}
              <strong>
                {duplicate?.coverage?.coverageStatus ||
                  record.indexing_status ||
                  'not indexed'}
              </strong>
            </p>
          </div>

          {duplicate && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Существующая запись: {duplicate.title} ({duplicate.status}). Save обновит её; дубль не
              создаётся.
            </p>
          )}

          <label className="block text-sm">
            Заголовок
            <input
              className={`${inputClass} mt-1`}
              value={record.title || ''}
              onChange={(event) => update('title', event.target.value)}
            />
          </label>

          <label className="block text-sm">
            Издание
            <input
              className={`${inputClass} mt-1`}
              value={record.outlet || ''}
              onChange={(event) => update('outlet', event.target.value)}
            />
          </label>

          <label className="block text-sm">
            Автор / byline
            <input
              className={`${inputClass} mt-1`}
              value={record.author || ''}
              onChange={(event) => update('author', event.target.value)}
            />
          </label>

          <label className="block text-sm">
            URL публикации
            <input
              className={`${inputClass} mt-1`}
              type="url"
              value={record.url || ''}
              onChange={(event) => update('url', event.target.value)}
            />
          </label>

          <label className="block text-sm">
            URL изображения
            <input
              className={`${inputClass} mt-1`}
              type="url"
              value={record.image_url || ''}
              onChange={(event) => update('image_url', event.target.value || null)}
            />
          </label>

          <label className="block text-sm">
            Краткое описание
            <textarea
              className={`${inputClass} mt-1`}
              rows={3}
              value={record.summary || ''}
              onChange={(event) => update('summary', event.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Дата публикации
              <input
                className={`${inputClass} mt-1`}
                type="date"
                value={record.published_date || ''}
                onChange={(event) => update('published_date', event.target.value || null)}
              />
            </label>

            <label className="block text-sm">
              Язык
              <select
                className={`${inputClass} mt-1`}
                value={record.lang || 'EN'}
                onChange={(event) => update('lang', event.target.value)}
              >
                {langs.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Тип
              <select
                className={`${inputClass} mt-1`}
                value={record.kind || 'mention'}
                onChange={(event) => update('kind', event.target.value)}
              >
                {kinds.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Тема
              <select
                className={`${inputClass} mt-1`}
                value={record.topic || topics[0]}
                onChange={(event) => update('topic', event.target.value)}
              >
                {topics.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!source && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Для этого preview нет сохранённого текста. Переключитесь на ручную вставку текста или
              загрузите PDF/TXT — исходный URL сохранится.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => resetPreview()}
              disabled={busy}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:opacity-40"
            >
              Отмена
            </button>

            <button
              type="button"
              disabled={busy || !source}
              onClick={() => void saveRecord('draft')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
            >
              Сохранить черновик
            </button>

            <button
              type="button"
              disabled={busy || !source}
              onClick={() => void saveRecord('published')}
              className="rounded-lg bg-[#990F3D] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#7E0C33] disabled:opacity-40"
            >
              Опубликовать
            </button>
          </div>
        </div>
      )}

      <MediaBulkImportPanel />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-2xl">Последние записи</h3>

          <span className="text-xs text-gray-500">{records.length} записей</span>
        </div>

        {records.length === 0 ? (
          <p className="border-b border-gray-200 py-4 text-sm text-gray-500">Записей пока нет.</p>
        ) : (
          records.map((item) => (
            <article
              key={item.id || item.canonical_url || item.url}
              className="flex items-start gap-4 border-b border-gray-200 py-4"
            >
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt=""
                  className="h-16 w-20 shrink-0 rounded object-cover"
                  referrerPolicy="no-referrer"
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">
                  {item.outlet || 'Издание не указано'}
                  {item.author ? ` · ${item.author}` : ''}
                  {' · '}
                  {item.published_date || 'Дата не указана'}
                  {' · '}
                  {item.coverage?.language || item.lang || '—'}
                </p>

                <p className="mt-1 break-words font-serif text-lg">
                  {item.title || 'Без заголовка'}
                </p>

                <a
                  className="mt-1 block truncate text-xs text-gray-500 underline"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.url}
                </a>

                <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-500">
                  {sourceLabel(item.source_format)}
                  {' · '}
                  {item.coverage?.textQuality || 'not extracted'}
                  {' · '}
                  {item.coverage?.extractionStatus || item.latest_job?.status || 'pending'}
                  {' · '}
                  {item.coverage?.sourceCharCount ?? 0} chars
                  {' · '}
                  {item.coverage?.chunkCount ?? 0} chunks
                  {' · '}
                  indexing: {item.indexing_status || item.coverage?.ingestionStatus || 'not indexed'}
                </p>

                {item.latest_job?.errorDetail && (
                  <p className="mt-1 text-[10px] text-red-700">{item.latest_job.errorDetail}</p>
                )}
              </div>

              <span className="shrink-0 text-xs text-gray-500">{item.status || 'draft'}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
