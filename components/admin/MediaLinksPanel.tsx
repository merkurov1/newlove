 'use client';

import { useEffect, useState } from 'react';

type RecordStatus = 'draft' | 'published';

type MediaRecord = {
  id?: string;
  url: string;
  canonical_url?: string;
  title: string;
  outlet: string;
  published_date: string | null;
  lang: string;
  kind: string;
  topic: string;
  summary: string;
  image_url: string | null;
  status?: RecordStatus;
  ai_metadata?: Record<string, unknown>;
};

type ApiResponse = {
  record?: MediaRecord;
  records?: MediaRecord[];
  error?: string;
};

const kinds = [
  'quote',
  'mention',
  'interview',
  'radio',
  'video',
  'column',
  'blog',
  'profile',
];

const topics = [
  'Internet & Censorship',
  'AI & Tech',
  'Art & Culture',
  'Fintech & Crypto',
];

const langs = ['EN', 'RU', 'DE', 'PL', 'BS'];

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-500';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function readResponse(response: Response): Promise<ApiResponse> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    throw new Error('Сервер вернул некорректный ответ.');
  }
}

export default function MediaLinksPanel() {
  const [url, setUrl] = useState('');
  const [record, setRecord] = useState<MediaRecord | null>(null);
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
      setMessage(
        getErrorMessage(error, 'Не удалось загрузить записи.'),
      );
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  async function parseUrl(): Promise<void> {
    const submittedUrl = url.trim();

    if (!submittedUrl) {
      setMessage('Введите URL публикации.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/media-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'parse',
          url: submittedUrl,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось разобрать ссылку.');
      }

      if (!data.record) {
        throw new Error('Сервер не вернул данные публикации.');
      }

      setRecord(data.record);
      setMessage(
        'Метаданные получены. Проверьте поля перед сохранением.',
      );
    } catch (error: unknown) {
      setMessage(
        getErrorMessage(error, 'Не удалось разобрать ссылку.'),
      );
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

    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/media-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          ...record,
          status,
        }),
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось сохранить запись.');
      }

      setRecord(null);
      setUrl('');
      setMessage(
        status === 'published'
          ? 'Публикация сохранена и опубликована.'
          : 'Черновик сохранён.',
      );

      await loadRecords();
    } catch (error: unknown) {
      setMessage(
        getErrorMessage(error, 'Не удалось сохранить запись.'),
      );
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof MediaRecord>(
    field: K,
    value: MediaRecord[K],
  ): void {
    setRecord(current =>
      current ? { ...current, [field]: value } : current,
    );
  }

  return (
    <section className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
          Editorial archive
        </p>

        <h2 className="mt-2 font-serif text-3xl text-gray-950">
          Media publications
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Добавление интервью, цитирований, колонок и других
          подтверждённых публикаций.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <label
          htmlFor="media-publication-url"
          className="mb-2 block text-sm font-medium"
        >
          URL публикации
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="media-publication-url"
            className={inputClass}
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="https://publication.com/article"
            type="url"
            autoComplete="url"
          />

          <button
            type="button"
            onClick={() => void parseUrl()}
            disabled={busy || !url.trim()}
            className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm text-white disabled:opacity-40"
          >
            {busy ? 'Обработка…' : 'Разобрать URL'}
          </button>
        </div>

        {message && (
          <p
            className="mt-3 text-sm text-gray-600"
            role="status"
            aria-live="polite"
          >
            {message}
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

          <label className="block text-sm">
            Заголовок
            <input
              className={`${inputClass} mt-1`}
              value={record.title || ''}
              onChange={event => update('title', event.target.value)}
            />
          </label>

          <label className="block text-sm">
            Издание
            <input
              className={`${inputClass} mt-1`}
              value={record.outlet || ''}
              onChange={event => update('outlet', event.target.value)}
            />
          </label>

          <label className="block text-sm">
            URL публикации
            <input
              className={`${inputClass} mt-1`}
              type="url"
              value={record.url || ''}
              onChange={event => update('url', event.target.value)}
            />
          </label>

          <label className="block text-sm">
            URL изображения
            <input
              className={`${inputClass} mt-1`}
              type="url"
              value={record.image_url || ''}
              onChange={event =>
                update('image_url', event.target.value || null)
              }
            />
          </label>

          <label className="block text-sm">
            Краткое описание
            <textarea
              className={`${inputClass} mt-1`}
              rows={3}
              value={record.summary || ''}
              onChange={event => update('summary', event.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Дата публикации
              <input
                className={`${inputClass} mt-1`}
                type="date"
                value={record.published_date || ''}
                onChange={event =>
                  update(
                    'published_date',
                    event.target.value || null,
                  )
                }
              />
            </label>

            <label className="block text-sm">
              Язык
              <select
                className={`${inputClass} mt-1`}
                value={record.lang || 'EN'}
                onChange={event => update('lang', event.target.value)}
              >
                {langs.map(value => (
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
                onChange={event => update('kind', event.target.value)}
              >
                {kinds.map(value => (
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
                onChange={event => update('topic', event.target.value)}
              >
                {topics.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setRecord(null)}
              disabled={busy}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:opacity-40"
            >
              Отмена
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void saveRecord('draft')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
            >
              Сохранить черновик
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void saveRecord('published')}
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              Опубликовать
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-2xl">Последние записи</h3>

          <span className="text-xs text-gray-500">
            {records.length} / 200
          </span>
        </div>

        {records.length === 0 ? (
          <p className="border-b border-gray-200 py-4 text-sm text-gray-500">
            Записей пока нет.
          </p>
        ) : (
          records.map(item => (
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
                  {' · '}
                  {item.published_date || 'Дата не указана'}
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
              </div>

              <span className="shrink-0 text-xs text-gray-500">
                {item.status || 'draft'}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}