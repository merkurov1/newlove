'use client';

import { useCallback, useEffect, useState } from 'react';

type Quote = {
  id: string;
  media_record_id: string;
  document_id: string;
  chunk_id: string | null;
  quote_text: string;
  quote_type: 'direct_quote' | 'indirect_quote' | 'mention';
  language: string | null;
  context_before: string;
  context_after: string;
  chunk_excerpt?: string | null;
  document_char_start: number;
  document_char_end: number;
  attribution: 'anton_merkurov' | 'other' | 'unknown';
  attribution_confidence: number;
  attribution_note: string | null;
  confidence: number;
  verification_status: 'unverified' | 'needs_review' | 'verified' | 'rejected' | 'superseded';
  translation: string | null;
  translation_language: string | null;
  translation_status: 'none' | 'draft' | 'verified' | 'rejected';
  reviewed_at: string | null;
};

type Relation = {
  id: string;
  relation_type: string;
  confidence: number;
  detected_by: string;
  evidence: Record<string, unknown>;
  review_status: 'unverified' | 'needs_review' | 'confirmed' | 'rejected';
  target_media_record_id: string;
  target_title: string | null;
  target_outlet: string | null;
  target_canonical_url: string | null;
};

type Run = {
  id: string;
  status: string;
  analyzer_version: string;
  model: string | null;
  quote_count: number;
  relation_count: number;
  topic_count: number;
  rejected_candidate_count: number;
  error_code: string | null;
  error_detail: string | null;
  created_at: string;
  completed_at: string | null;
};

type Analysis = {
  run: Run;
  quotes: Quote[];
  topics: {
    primary_topic: string;
    subtopics: string[];
    confidence: number;
    method: string;
  } | null;
  editorialRole: {
    role: string;
    confidence: number;
    evidence: string | null;
  } | null;
  relations: Relation[];
};

type Response = {
  mediaRecord: {
    id: string;
    title: string;
    outlet: string;
    canonical_url: string;
    published_date: string | null;
    lang: string;
  };
  document: {
    id: string;
    title: string;
    chunk_count: number;
    source_char_count: number;
    language: string | null;
    media_text_quality: string | null;
    media_coverage_status: string | null;
  };
  analysis: Analysis | null;
  runs: Run[];
  source: {
    title: string;
    outlet: string;
    canonicalUrl: string;
    publishedDate: string | null;
    language: string | null;
    textQuality: string | null;
    chunkCount: number;
    sourceCharCount: number;
  };
  error?: string;
};

const inputClass =
  'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500';

const buttonClass =
  'rounded-md border border-gray-300 px-3 py-1.5 text-xs transition hover:border-gray-500 disabled:opacity-40';

const primaryButtonClass =
  'rounded-md bg-[#990F3D] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#7E0C33] disabled:opacity-40';

function confidence(value: number): string {
  return `${Math.round(Number(value) * 100)}%`;
}

function quoteTypeLabel(value: string): string {
  switch (value) {
    case 'direct_quote':
      return 'Direct quote';
    case 'indirect_quote':
      return 'Indirect';
    case 'mention':
      return 'Mention';
    default:
      return value;
  }
}

function verificationClass(value: string): string {
  switch (value) {
    case 'verified':
      return 'border-green-200 bg-green-50 text-green-800';
    case 'rejected':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'needs_review':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-600';
  }
}

function QuoteCard({ quote, onSaved }: { quote: Quote; onSaved: () => Promise<void> }) {
  const [verification, setVerification] = useState(quote.verification_status);
  const [attribution, setAttribution] = useState(quote.attribution);
  const [attributionNote, setAttributionNote] = useState(quote.attribution_note || '');
  const [translation, setTranslation] = useState(quote.translation || '');
  const [translationLanguage, setTranslationLanguage] = useState(quote.translation_language || '');
  const [translationStatus, setTranslationStatus] = useState(quote.translation_status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save(nextVerification?: Quote['verification_status']): Promise<void> {
    setBusy(true);
    setMessage('');

    const status = nextVerification || verification;
    setVerification(status);

    try {
      const response = await fetch(`/api/admin/media-quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verification_status: status,
          attribution,
          attribution_note: attributionNote || null,
          translation: translation || null,
          translation_language: translationLanguage || null,
          translation_status: translationStatus,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить проверку.');

      setMessage('Сохранено.');
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить проверку.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex border px-2 py-0.5 text-[10px] uppercase tracking-wider ${verificationClass(quote.verification_status)}`}
        >
          {quote.verification_status}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          {quoteTypeLabel(quote.quote_type)} · {confidence(quote.confidence)} ·{' '}
          {quote.language || '—'}
        </span>
        {quote.chunk_id && (
          <span className="font-mono text-[10px] text-gray-400">{quote.chunk_id}</span>
        )}
      </div>

      <blockquote className="mt-4 border-l-2 border-[#990F3D] pl-4 font-serif text-lg leading-8 text-gray-900 whitespace-pre-wrap">
        <span className="text-gray-500">{quote.context_before} </span>
        <mark className="bg-amber-100 text-gray-900">{quote.quote_text}</mark>
        <span className="text-gray-500"> {quote.context_after}</span>
      </blockquote>

      {quote.chunk_excerpt && (
        <details className="mt-3 text-xs text-gray-500">
          <summary className="cursor-pointer">Исходный chunk</summary>
          <p className="mt-2 whitespace-pre-wrap border border-gray-100 bg-gray-50 p-3">
            {quote.chunk_excerpt}
          </p>
        </details>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-600">
          Проверка
          <select
            className={`${inputClass} mt-1`}
            value={verification}
            onChange={(event) =>
              setVerification(event.target.value as Quote['verification_status'])
            }
          >
            <option value="unverified">unverified</option>
            <option value="needs_review">needs_review</option>
            <option value="verified">verified</option>
            <option value="rejected">rejected</option>
          </select>
        </label>

        <label className="text-xs text-gray-600">
          Атрибуция
          <select
            className={`${inputClass} mt-1`}
            value={attribution}
            onChange={(event) => setAttribution(event.target.value as Quote['attribution'])}
          >
            <option value="anton_merkurov">Anton Merkurov</option>
            <option value="unknown">Unknown</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="text-xs text-gray-600 md:col-span-2">
          Комментарий к атрибуции
          <input
            className={`${inputClass} mt-1`}
            value={attributionNote}
            onChange={(event) => setAttributionNote(event.target.value)}
            placeholder="Почему цитата принадлежит или не принадлежит Антону"
          />
        </label>

        <label className="text-xs text-gray-600 md:col-span-2">
          Перевод (хранится отдельно)
          <textarea
            className={`${inputClass} mt-1`}
            rows={2}
            value={translation}
            onChange={(event) => setTranslation(event.target.value)}
          />
        </label>

        <label className="text-xs text-gray-600">
          Язык перевода
          <input
            className={`${inputClass} mt-1`}
            value={translationLanguage}
            onChange={(event) => setTranslationLanguage(event.target.value)}
            placeholder="ru"
          />
        </label>

        <label className="text-xs text-gray-600">
          Статус перевода
          <select
            className={`${inputClass} mt-1`}
            value={translationStatus}
            onChange={(event) =>
              setTranslationStatus(event.target.value as Quote['translation_status'])
            }
          >
            <option value="none">none</option>
            <option value="draft">draft</option>
            <option value="verified">verified</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? 'Сохранение…' : 'Сохранить проверку'}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void save('verified')}
          disabled={busy}
        >
          Подтвердить
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void save('rejected')}
          disabled={busy}
        >
          Отклонить
        </button>
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    </article>
  );
}

export default function MediaAnalysisClient({ mediaRecordId }: { mediaRecordId: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/media-records/${mediaRecordId}/analysis`, {
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => ({}))) as Response;
      if (!response.ok) throw new Error(json.error || 'Не удалось загрузить анализ.');
      setData(json);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить анализ.');
    } finally {
      setLoading(false);
    }
  }, [mediaRecordId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAnalysis(force: boolean): Promise<void> {
    setRunning(true);
    setMessage('');

    try {
      const response = await fetch(`/api/admin/media-records/${mediaRecordId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Не удалось запустить анализ.');
      setMessage(
        json.result?.skipped
          ? 'Текст не изменился; использован предыдущий анализ.'
          : 'Анализ завершён.'
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось запустить анализ.');
    } finally {
      setRunning(false);
    }
  }

  async function reviewRelation(id: string, status: 'confirmed' | 'rejected'): Promise<void> {
    try {
      const response = await fetch(`/api/admin/media-relations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: status }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Не удалось обновить связь.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось обновить связь.');
    }
  }

  if (loading && !data) {
    return <p className="py-12 text-center text-sm text-gray-500">Загрузка анализа…</p>;
  }

  if (!data) {
    return (
      <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {message || 'Не удалось загрузить анализ.'}
      </div>
    );
  }

  const analysis = data.analysis;

  return (
    <div className="space-y-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Media intelligence</p>
        <h1 className="mt-2 font-serif text-3xl text-gray-950">{data.mediaRecord.title}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {data.mediaRecord.outlet} · {data.mediaRecord.published_date || 'дата не указана'} ·{' '}
          {data.source.language || '—'} · {data.source.textQuality || '—'} ·{' '}
          {data.source.sourceCharCount} символов · {data.source.chunkCount} chunks
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            className={buttonClass}
            href={data.mediaRecord.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть источник
          </a>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => void runAnalysis(false)}
            disabled={running}
          >
            {running ? 'Анализ…' : 'Анализировать'}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void runAnalysis(true)}
            disabled={running}
          >
            Повторить анализ
          </button>
        </div>
        {message && (
          <p className="mt-3 text-sm text-gray-600" role="status" aria-live="polite">
            {message}
          </p>
        )}
      </header>

      {!analysis ? (
        <div className="border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Анализ ещё не запускался. Для запуска нужен проиндексированный полный или частичный текст.
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500">Тема</p>
              <p className="mt-2 font-serif text-xl">{analysis.topics?.primary_topic || '—'}</p>
              {analysis.topics?.subtopics?.length ? (
                <p className="mt-1 text-xs text-gray-500">
                  {analysis.topics.subtopics.join(' · ')}
                </p>
              ) : null}
            </div>
            <div className="border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500">Редакционная роль</p>
              <p className="mt-2 font-serif text-xl">{analysis.editorialRole?.role || 'unknown'}</p>
              <p className="mt-1 text-xs text-gray-500">
                {analysis.editorialRole ? confidence(analysis.editorialRole.confidence) : '—'}
              </p>
            </div>
            <div className="border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wider text-gray-500">Результат</p>
              <p className="mt-2 text-sm text-gray-700">
                {analysis.quotes.length} цитат · {analysis.relations.length} связей ·{' '}
                {analysis.run.rejected_candidate_count} отклонено
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {analysis.run.analyzer_version} · {analysis.run.model || '—'}
              </p>
            </div>
          </section>

          {analysis.editorialRole?.evidence && (
            <section className="border border-gray-200 bg-white p-4 text-sm text-gray-600">
              <span className="text-xs uppercase tracking-wider text-gray-500">
                Основание роли:{' '}
              </span>
              {analysis.editorialRole.evidence}
            </section>
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl">Цитаты и упоминания</h2>
              <span className="text-xs text-gray-500">{analysis.quotes.length}</span>
            </div>
            {analysis.quotes.length === 0 ? (
              <p className="border-b border-gray-200 py-4 text-sm text-gray-500">
                Цитаты не найдены.
              </p>
            ) : (
              analysis.quotes.map((quote) => (
                <QuoteCard key={quote.id} quote={quote} onSaved={load} />
              ))
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl">Связи публикаций</h2>
              <span className="text-xs text-gray-500">{analysis.relations.length}</span>
            </div>
            {analysis.relations.length === 0 ? (
              <p className="border-b border-gray-200 py-4 text-sm text-gray-500">
                Связи не обнаружены.
              </p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 bg-white">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Публикация</th>
                      <th className="px-3 py-2">Тип</th>
                      <th className="px-3 py-2">Confidence</th>
                      <th className="px-3 py-2">Основание</th>
                      <th className="px-3 py-2">Статус</th>
                      <th className="px-3 py-2">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.relations.map((relation) => (
                      <tr key={relation.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <a
                            className="underline"
                            href={relation.target_canonical_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {relation.target_title || relation.target_media_record_id}
                          </a>
                          <span className="block text-gray-500">{relation.target_outlet}</span>
                        </td>
                        <td className="px-3 py-2">{relation.relation_type}</td>
                        <td className="px-3 py-2">{confidence(relation.confidence)}</td>
                        <td className="max-w-[280px] px-3 py-2 text-gray-500">
                          {relation.detected_by}
                        </td>
                        <td className="px-3 py-2">{relation.review_status}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={buttonClass}
                              onClick={() => void reviewRelation(relation.id, 'confirmed')}
                            >
                              Подтвердить
                            </button>
                            <button
                              type="button"
                              className={buttonClass}
                              onClick={() => void reviewRelation(relation.id, 'rejected')}
                            >
                              Отклонить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-serif text-2xl">История запусков</h2>
            {data.runs.map((run) => (
              <p key={run.id} className="border-b border-gray-100 py-2 text-xs text-gray-500">
                {run.created_at.slice(0, 16).replace('T', ' ')} · {run.status} · {run.quote_count}{' '}
                цитат · {run.relation_count} связей
                {run.error_code ? ` · ${run.error_code}` : ''}
              </p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
