'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Section =
  'overview' | 'timeline' | 'topics' | 'outlets' | 'quotes' | 'relations' | 'quality' | 'search';

type Filters = {
  from: string;
  to: string;
  topic: string;
  language: string;
  outlet: string;
  status: string;
  page: number;
  pageSize: number;
};

type FilterOptions = {
  topics: string[];
  languages: string[];
  outlets: string[];
  range: { from: string | null; to: string | null };
};

type Overview = {
  total: number;
  byStatus: { published: number; draft: number };
  outlets: number;
  languages: Array<{ language: string; count: number }>;
  range: { from: string | null; to: string | null };
  quotes: {
    direct: number;
    indirect: number;
    mentions: number;
    verifiedDirect: number;
    pending: number;
    unconfirmedAttribution: number;
  };
  fullTextShare: number | null;
  awaitingReviewShare: number | null;
  awaitingReviewPublications: number;
  missingDates: number;
  extractionErrors: number;
};

type Timeline = {
  months: Array<{
    month: string;
    publications: number;
    direct_quotes: number;
    indirect_quotes: number;
    mentions: number;
  }>;
  years: Array<{ year: string; publications: number }>;
  topicTimeline: Array<{ month: string; topic: string; publications: number }>;
};

type Topics = {
  distribution: Array<{
    topic: string;
    publications: number;
    full_text: number;
    direct_quotes: number;
  }>;
  subtopics: Array<{ subtopic: string; count: number }>;
  characteristic: Array<{
    id: string;
    title: string;
    outlet: string;
    effective_date: string | null;
    effective_topic: string;
    direct_quotes: number;
  }>;
};

type Outlets = {
  rows: Array<{
    outlet: string;
    publications: number;
    languages: string[];
    full_text: number;
    direct_quotes: number;
    last_publication: string | null;
    country: string | null;
  }>;
  total: number;
  countries: Array<{ country: string; publications: number }>;
};

type Quotes = {
  counts: {
    direct: number;
    indirect: number;
    mentions: number;
    verified_direct: number;
    unconfirmed: number;
    total: number;
  };
  topics: Array<{ topic: string; quotes: number; verified: number }>;
  outlets: Array<{ outlet: string; direct_quotes: number }>;
  publications: Array<{
    id: string;
    title: string;
    outlet: string;
    effective_date: string | null;
    quotes: number;
    direct_quotes: number;
    verified: number;
  }>;
  pending: Array<{
    id: string;
    media_record_id: string;
    title: string;
    outlet: string;
    quote_text: string;
    quote_type: string;
    attribution: string;
    confidence: number;
  }>;
  pendingTotal: number;
};

type Relations = {
  counts: Array<{
    relation_type: string;
    count: number;
    confirmed: number;
    review: number;
  }>;
  rows: Array<{
    id: string;
    relation_type: string;
    confidence: number;
    detected_by: string;
    review_status: string;
    target_media_record_id: string;
    target_title: string;
    target_outlet: string;
    target_canonical_url: string;
  }>;
  total: number;
  clusters: Array<{ topic: string; publications: number; subtopics: string[] }>;
};

type Quality = {
  counts: {
    missing_dates: number;
    without_text: number;
    extraction_errors: number;
    duplicate_groups: number;
    pending_quotes: number;
    missing_embeddings: number;
  };
  missingDates: Array<{ id: string; title: string; outlet: string }>;
  withoutText: Array<{
    id: string;
    title: string;
    outlet: string;
    media_coverage_status: string | null;
    media_text_quality: string | null;
    chunk_count: number | null;
  }>;
  extractionErrors: Array<{
    id: string;
    title: string;
    outlet: string;
    media_coverage_status: string | null;
    media_text_quality: string | null;
  }>;
  duplicates: Array<{ content_hash: string; count: number; titles: string[] }>;
  pendingQuotes: Array<{
    id: string;
    title: string;
    outlet: string;
    quote_text: string;
    verification_status: string;
    attribution: string;
  }>;
  missingEmbeddings: Array<{
    id: string;
    title: string;
    outlet: string;
    chunk_count: number;
  }>;
};

type SearchResult = {
  summary: string;
  facts: Array<{
    text: string;
    documentId: string;
    chunkId: string;
    title: string;
    outlet: string;
  }>;
  interpretation: string[];
  insufficient: boolean;
  count: number;
  results: Array<{
    chunkId: string;
    documentId: string;
    mediaRecordId: string;
    title: string;
    outlet: string;
    canonicalUrl: string;
    publishedDate: string | null;
    language: string | null;
    content: string;
    heading: string;
    similarity: number;
    topic: string | null;
    quotes: Array<{
      id: string;
      quoteText: string;
      quoteType: string;
      verificationStatus: string;
      attribution: string;
    }>;
  }>;
};

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Общая картина' },
  { id: 'timeline', label: 'Хронология' },
  { id: 'topics', label: 'Темы' },
  { id: 'outlets', label: 'Издания' },
  { id: 'quotes', label: 'Цитирование' },
  { id: 'relations', label: 'Связи' },
  { id: 'quality', label: 'Качество данных' },
  { id: 'search', label: 'Семантический поиск' },
];

const inputClass =
  'w-full border border-[#D9D3CD] bg-white px-2.5 py-2 text-xs text-[#211F1F] outline-none focus:border-[#990F3D]';

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-GB');
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;
}

function date(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="border-t border-[#D9D3CD] py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">{label}</p>
      <p className="mt-1.5 font-serif text-2xl text-[#211F1F]">{value}</p>
      {detail && <p className="mt-1 text-[10px] leading-relaxed text-[#89827B]">{detail}</p>}
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-[#D9D3CD] pb-4">
      <h2 className="font-serif text-2xl text-[#211F1F]">{title}</h2>
      {description && (
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#746D66]">{description}</p>
      )}
    </div>
  );
}

function Bar({
  value,
  max,
  label,
  right,
}: {
  value: number;
  max: number;
  label: string;
  right?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-mono text-[10px]">{right ?? value}</span>
      </div>
      <div className="mt-1 h-1.5 bg-[#EEE9E4]">
        <div
          className="h-full bg-[#990F3D]"
          style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-b border-[#EEE9E4] py-6 text-xs text-[#89827B]">{children}</p>;
}

export default function MediaIntelligenceDashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [filters, setFilters] = useState<Filters>({
    from: '',
    to: '',
    topic: '',
    language: '',
    outlet: '',
    status: '',
    page: 1,
    pageSize: 20,
  });
  const [options, setOptions] = useState<FilterOptions>({
    topics: [],
    languages: [],
    outlets: [],
    range: { from: null, to: null },
  });
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.topic) params.set('topic', filters.topic);
    if (filters.language) params.set('language', filters.language);
    if (filters.outlet) params.set('outlet', filters.outlet);
    if (filters.status) params.set('status', filters.status);
    params.set('page', String(filters.page));
    params.set('pageSize', String(filters.pageSize));

    return params.toString();
  }, [filters]);

  useEffect(() => {
    fetch('/api/admin/media/intelligence/filters', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (json?.data) setOptions(json.data as FilterOptions);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (section === 'search') return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/media/intelligence/${section}?${queryString}`, {
        cache: 'no-store',
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Не удалось загрузить аналитику.');
      setData(json.data ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить аналитику.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString, section]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]): void {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' || key === 'pageSize' ? (value as number) : 1,
    }));
  }

  async function runSearch(): Promise<void> {
    if (!query.trim()) return;

    setSearching(true);
    setError('');

    try {
      const response = await fetch('/api/admin/media/intelligence/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          filters: {
            from: filters.from,
            to: filters.to,
            topic: filters.topic,
            language: filters.language,
            outlet: filters.outlet,
            status: filters.status,
          },
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Поиск недоступен.');
      setSearch(json.data as SearchResult);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Поиск недоступен.');
      setSearch(null);
    } finally {
      setSearching(false);
    }
  }

  const overview = data as Overview | null;
  const timeline = data as Timeline | null;
  const topics = data as Topics | null;
  const outlets = data as Outlets | null;
  const quotes = data as Quotes | null;
  const relations = data as Relations | null;
  const quality = data as Quality | null;

  return (
    <div className="space-y-7">
      <header className="border-b border-[#D9D3CD] pb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Media Intelligence
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
              Аналитика медиа-архива
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#746D66]">
              Точные показатели считаются SQL по архиву, цитатам, темам и связям. RAG используется
              только для смыслового поиска и интерпретации, а не для подсчёта статистики.
            </p>
          </div>
          <Link href="/admin/media" className="text-xs text-[#8B1E3F] underline underline-offset-2">
            ← Медиа-публикации
          </Link>
        </div>
      </header>

      <section className="grid gap-3 border border-[#E5E1DC] bg-white/70 p-4 sm:grid-cols-2 lg:grid-cols-7">
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          С
          <input
            type="date"
            className={`${inputClass} mt-1`}
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
          />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          По
          <input
            type="date"
            className={`${inputClass} mt-1`}
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
          />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Тема
          <select
            className={`${inputClass} mt-1`}
            value={filters.topic}
            onChange={(event) => updateFilter('topic', event.target.value)}
          >
            <option value="">Все</option>
            {options.topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Язык
          <select
            className={`${inputClass} mt-1`}
            value={filters.language}
            onChange={(event) => updateFilter('language', event.target.value)}
          >
            <option value="">Все</option>
            {options.languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Издание
          <select
            className={`${inputClass} mt-1`}
            value={filters.outlet}
            onChange={(event) => updateFilter('outlet', event.target.value)}
          >
            <option value="">Все</option>
            {options.outlets.map((outlet) => (
              <option key={outlet} value={outlet}>
                {outlet}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Статус
          <select
            className={`${inputClass} mt-1`}
            value={filters.status}
            onChange={(event) => updateFilter('status', event.target.value)}
          >
            <option value="">Все</option>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>
        </label>
        <button
          type="button"
          className="self-end border border-[#D9D3CD] px-3 py-2 text-xs text-[#625D58] hover:border-[#990F3D]"
          onClick={() =>
            setFilters({
              from: '',
              to: '',
              topic: '',
              language: '',
              outlet: '',
              status: '',
              page: 1,
              pageSize: 20,
            })
          }
        >
          Сбросить
        </button>
      </section>

      <nav className="flex flex-wrap gap-1 border-b border-[#D9D3CD] pb-2">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSection(item.id);
              setFilters((current) => ({ ...current, page: 1 }));
            }}
            className={[
              'border px-3 py-1.5 text-xs transition',
              section === item.id
                ? 'border-[#E7C9D2] bg-[#F8EAF0] text-[#7E0C33]'
                : 'border-transparent text-[#625D58] hover:border-[#D9D3CD] hover:bg-white',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && <p className="border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}

      {section !== 'search' && loading && (
        <p className="py-8 text-center text-xs text-[#89827B]">Загрузка…</p>
      )}

      {section !== 'search' && !loading && data !== null && (
        <div className="space-y-7">
          {section === 'overview' && overview && (
            <>
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Всего публикаций" value={number(overview.total)} />
                <Metric label="Published" value={number(overview.byStatus.published)} />
                <Metric label="Draft" value={number(overview.byStatus.draft)} />
                <Metric label="Изданий" value={number(overview.outlets)} />
                <Metric
                  label="Период"
                  value={`${date(overview.range.from)} — ${date(overview.range.to)}`}
                />
                <Metric label="Полный текст" value={percent(overview.fullTextShare)} />
                <Metric
                  label="Ожидают проверки"
                  value={percent(overview.awaitingReviewShare)}
                  detail={`${number(overview.awaitingReviewPublications)} публикаций`}
                />
                <Metric label="Без даты" value={number(overview.missingDates)} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Цитирование" />
                  <div className="grid gap-x-6 sm:grid-cols-2">
                    <Metric label="Прямые цитаты" value={number(overview.quotes.direct)} />
                    <Metric label="Косвенные" value={number(overview.quotes.indirect)} />
                    <Metric label="Упоминания" value={number(overview.quotes.mentions)} />
                    <Metric
                      label="Подтверждённые прямые"
                      value={number(overview.quotes.verifiedDirect)}
                    />
                    <Metric label="Ожидают проверки" value={number(overview.quotes.pending)} />
                    <Metric
                      label="Атрибуция неясна"
                      value={number(overview.quotes.unconfirmedAttribution)}
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionTitle title="Языки" />
                  {overview.languages.length === 0 ? (
                    <Empty>Нет данных о языках.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {overview.languages.slice(0, 12).map((item) => (
                        <Bar
                          key={item.language}
                          label={item.language}
                          value={item.count}
                          max={Math.max(...overview.languages.map((entry) => entry.count))}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {section === 'timeline' && timeline && (
            <>
              <SectionTitle
                title="Хронология"
                description="Публикации по месяцам и динамика прямого/косвенного цитирования."
              />
              {timeline.months.length === 0 ? (
                <Empty>Нет публикаций с датами в выбранном периоде.</Empty>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const max = Math.max(1, ...timeline.months.map((item) => item.publications));
                    return timeline.months.map((item) => (
                      <div
                        key={item.month}
                        className="grid grid-cols-[88px_1fr_auto] items-center gap-3"
                      >
                        <span className="font-mono text-[10px] text-[#89827B]">{item.month}</span>
                        <div className="h-3 bg-[#EEE9E4]">
                          <div
                            className="h-full bg-[#990F3D]"
                            style={{ width: `${(item.publications / max) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[#625D58]">
                          {item.publications} публ. · {item.direct_quotes} direct ·{' '}
                          {item.indirect_quotes} indirect · {item.mentions} mention
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="По годам" />
                  {timeline.years.map((item) => (
                    <p
                      key={item.year}
                      className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                    >
                      <span>{item.year}</span>
                      <span className="font-mono">{item.publications}</span>
                    </p>
                  ))}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Темы во времени" />
                  {timeline.topicTimeline.slice(-24).map((item) => (
                    <p
                      key={`${item.month}-${item.topic}`}
                      className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                    >
                      <span className="truncate">
                        {item.month} · {item.topic}
                      </span>
                      <span className="font-mono">{item.publications}</span>
                    </p>
                  ))}
                </section>
              </div>
            </>
          )}

          {section === 'topics' && topics && (
            <>
              <SectionTitle
                title="Темы"
                description="Существующая классификация и уточнённые подтемы."
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Распределение" />
                  {topics.distribution.map((item) => (
                    <Bar
                      key={item.topic}
                      label={item.topic}
                      value={item.publications}
                      max={Math.max(1, ...topics.distribution.map((entry) => entry.publications))}
                      right={`${item.publications} · ${item.direct_quotes} direct`}
                    />
                  ))}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Подтемы" />
                  {topics.subtopics.length === 0 ? (
                    <Empty>Подтемы пока не извлечены.</Empty>
                  ) : (
                    topics.subtopics.map((item) => (
                      <Bar
                        key={item.subtopic}
                        label={item.subtopic}
                        value={item.count}
                        max={Math.max(...topics.subtopics.map((entry) => entry.count))}
                      />
                    ))
                  )}
                </section>
              </div>
              <section className="space-y-3">
                <SectionTitle title="Характерные публикации" />
                <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="bg-[#F7F5F2] text-[#89827B]">
                      <tr>
                        <th className="px-3 py-2">Тема</th>
                        <th className="px-3 py-2">Публикация</th>
                        <th className="px-3 py-2">Издание</th>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Direct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topics.characteristic.map((item) => (
                        <tr
                          key={`${item.effective_topic}-${item.id}`}
                          className="border-t border-[#EEE9E4]"
                        >
                          <td className="px-3 py-2">{item.effective_topic}</td>
                          <td className="px-3 py-2">
                            <Link className="underline" href={`/admin/media/${item.id}/analysis`}>
                              {item.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{item.outlet}</td>
                          <td className="px-3 py-2">{date(item.effective_date)}</td>
                          <td className="px-3 py-2 font-mono">{item.direct_quotes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {section === 'outlets' && outlets && (
            <>
              <SectionTitle
                title="Издания и география"
                description="Страна показывается только если она явно указана в данных издания. Язык публикации не используется как доказательство страны."
              />
              <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-[#F7F5F2] text-[#89827B]">
                    <tr>
                      <th className="px-3 py-2">Издание</th>
                      <th className="px-3 py-2">Публикаций</th>
                      <th className="px-3 py-2">Языки</th>
                      <th className="px-3 py-2">Full text</th>
                      <th className="px-3 py-2">Direct quotes</th>
                      <th className="px-3 py-2">Последняя</th>
                      <th className="px-3 py-2">Страна</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlets.rows.map((item) => (
                      <tr key={item.outlet} className="border-t border-[#EEE9E4]">
                        <td className="px-3 py-2">{item.outlet}</td>
                        <td className="px-3 py-2 font-mono">{item.publications}</td>
                        <td className="px-3 py-2">{item.languages.join(', ') || '—'}</td>
                        <td className="px-3 py-2 font-mono">{item.full_text}</td>
                        <td className="px-3 py-2 font-mono">{item.direct_quotes}</td>
                        <td className="px-3 py-2">{date(item.last_publication)}</td>
                        <td className="px-3 py-2">{item.country || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <SectionTitle title="Страны с явными данными" />
                  {outlets.countries.length === 0 ? (
                    <Empty>Достоверных страновых данных нет.</Empty>
                  ) : (
                    outlets.countries.map((item) => (
                      <p
                        key={item.country}
                        className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                      >
                        <span>{item.country}</span>
                        <span className="font-mono">{item.publications}</span>
                      </p>
                    ))
                  )}
                </section>
                <section>
                  <SectionTitle title="Пагинация" />
                  <Pager
                    page={filters.page}
                    pageSize={filters.pageSize}
                    total={outlets.total}
                    onPage={(page) => updateFilter('page', page)}
                    onPageSize={(pageSize) => updateFilter('pageSize', pageSize)}
                  />
                </section>
              </div>
            </>
          )}

          {section === 'quotes' && quotes && (
            <>
              <SectionTitle
                title="Цитирование"
                description="Подтверждённые и неподтверждённые цитаты, темы и издания."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Всего цитат" value={number(quotes.counts.total)} />
                <Metric label="Прямые" value={number(quotes.counts.direct)} />
                <Metric
                  label="Подтверждённые прямые"
                  value={number(quotes.counts.verified_direct)}
                />
                <Metric label="Неясная атрибуция" value={number(quotes.counts.unconfirmed)} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Самые цитируемые темы" />
                  {quotes.topics.map((item) => (
                    <Bar
                      key={item.topic}
                      label={item.topic}
                      value={item.quotes}
                      max={Math.max(1, ...quotes.topics.map((entry) => entry.quotes))}
                      right={`${item.quotes} · ${item.verified} verified`}
                    />
                  ))}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Издания с прямыми цитатами" />
                  {quotes.outlets.map((item) => (
                    <Bar
                      key={item.outlet}
                      label={item.outlet}
                      value={item.direct_quotes}
                      max={Math.max(1, ...quotes.outlets.map((entry) => entry.direct_quotes))}
                    />
                  ))}
                </section>
              </div>
              <section className="space-y-3">
                <SectionTitle title="Публикации с наиболее содержательными комментариями" />
                <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="bg-[#F7F5F2] text-[#89827B]">
                      <tr>
                        <th className="px-3 py-2">Публикация</th>
                        <th className="px-3 py-2">Издание</th>
                        <th className="px-3 py-2">Цитат</th>
                        <th className="px-3 py-2">Прямых</th>
                        <th className="px-3 py-2">Проверено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.publications.map((item) => (
                        <tr key={item.id} className="border-t border-[#EEE9E4]">
                          <td className="px-3 py-2">
                            <Link className="underline" href={`/admin/media/${item.id}/analysis`}>
                              {item.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{item.outlet}</td>
                          <td className="px-3 py-2 font-mono">{item.quotes}</td>
                          <td className="px-3 py-2 font-mono">{item.direct_quotes}</td>
                          <td className="px-3 py-2 font-mono">{item.verified}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="space-y-3">
                <SectionTitle title="Неподтверждённая атрибуция" />
                {quotes.pending.length === 0 ? (
                  <Empty>Нет цитат, ожидающих проверки.</Empty>
                ) : (
                  <>
                    {quotes.pending.map((item) => (
                      <article key={item.id} className="border border-[#E5E1DC] bg-white/70 p-3">
                        <p className="text-xs text-[#625D58]">
                          {item.outlet} · {item.quote_type} · {item.attribution} ·{' '}
                          {percent(item.confidence * 100)}
                        </p>
                        <p className="mt-1 text-sm">“{item.quote_text}”</p>
                        <Link
                          className="mt-1 inline-flex text-[10px] text-[#8B1E3F] underline"
                          href={`/admin/media/${item.media_record_id}/analysis`}
                        >
                          Проверить цитату
                        </Link>
                      </article>
                    ))}
                    <Pager
                      page={filters.page}
                      pageSize={filters.pageSize}
                      total={quotes.pendingTotal}
                      onPage={(page) => updateFilter('page', page)}
                      onPageSize={(pageSize) => updateFilter('pageSize', pageSize)}
                    />
                  </>
                )}
              </section>
            </>
          )}

          {section === 'relations' && relations && (
            <>
              <SectionTitle
                title="Связи публикаций"
                description="Перепечатки, синдикация, общие сюжеты и тематические кластеры."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {relations.counts.map((item) => (
                  <Metric
                    key={item.relation_type}
                    label={item.relation_type}
                    value={number(item.count)}
                    detail={`${item.confirmed} confirmed · ${item.review} review`}
                  />
                ))}
              </div>
              <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-[#F7F5F2] text-[#89827B]">
                    <tr>
                      <th className="px-3 py-2">Публикация</th>
                      <th className="px-3 py-2">Связана с</th>
                      <th className="px-3 py-2">Тип</th>
                      <th className="px-3 py-2">Confidence</th>
                      <th className="px-3 py-2">Основание</th>
                      <th className="px-3 py-2">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.rows.map((item) => (
                      <tr key={item.id} className="border-t border-[#EEE9E4]">
                        <td className="px-3 py-2">
                          <Link
                            className="underline"
                            href={`/admin/media/${item.target_media_record_id}/analysis`}
                          >
                            {item.target_title}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{item.target_outlet}</td>
                        <td className="px-3 py-2">{item.relation_type}</td>
                        <td className="px-3 py-2 font-mono">{percent(item.confidence * 100)}</td>
                        <td className="px-3 py-2">{item.detected_by}</td>
                        <td className="px-3 py-2">{item.review_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={filters.page}
                pageSize={filters.pageSize}
                total={relations.total}
                onPage={(page) => updateFilter('page', page)}
                onPageSize={(pageSize) => updateFilter('pageSize', pageSize)}
              />
              <section className="space-y-3">
                <SectionTitle title="Тематические кластеры" />
                {relations.clusters.map((item) => (
                  <p key={item.topic} className="border-b border-[#EEE9E4] py-2 text-xs">
                    {item.topic} · {item.publications} публикаций ·{' '}
                    {item.subtopics.join(', ') || '—'}
                  </p>
                ))}
              </section>
            </>
          )}

          {section === 'quality' && quality && (
            <>
              <SectionTitle
                title="Качество данных"
                description="Пробелы, ошибки extraction, дубликаты и отсутствующие embeddings."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                <Metric label="Без даты" value={number(quality.counts.missing_dates)} />
                <Metric label="Без полного текста" value={number(quality.counts.without_text)} />
                <Metric
                  label="Ошибки extraction"
                  value={number(quality.counts.extraction_errors)}
                />
                <Metric label="Группы дубликатов" value={number(quality.counts.duplicate_groups)} />
                <Metric label="Цитаты на проверке" value={number(quality.counts.pending_quotes)} />
                <Metric label="Без embeddings" value={number(quality.counts.missing_embeddings)} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Без даты" />
                  {quality.missingDates.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.missingDates.map((item) => (
                      <p key={item.id} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.title} · {item.outlet}
                      </p>
                    ))
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Ошибки extraction" />
                  {quality.extractionErrors.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.extractionErrors.map((item) => (
                      <p key={item.id} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.title} · {item.media_coverage_status || '—'} ·{' '}
                        {item.media_text_quality || '—'}
                      </p>
                    ))
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Дубликаты-кандидаты" />
                  {quality.duplicates.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.duplicates.map((item) => (
                      <p key={item.content_hash} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.count} записей · {item.titles.join(' · ')}
                      </p>
                    ))
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Документы без embeddings" />
                  {quality.missingEmbeddings.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.missingEmbeddings.map((item) => (
                      <p key={item.id} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.title} · {item.chunk_count} chunks
                      </p>
                    ))
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}

      {section === 'search' && (
        <div className="space-y-5">
          <SectionTitle
            title="Семантический поиск"
            description="Вопрос по архиву. Ответ строится только на найденных фрагментах; статистика архива здесь не вычисляется."
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              className="min-h-[84px] flex-1 border border-[#D9D3CD] bg-white px-3 py-2 text-sm outline-none focus:border-[#990F3D]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: какие публикации связывают контроль интернета с hardware-ограничениями?"
            />
            <button
              type="button"
              className="self-end bg-[#990F3D] px-4 py-2.5 text-sm text-white hover:bg-[#7E0C33] disabled:opacity-40"
              onClick={() => void runSearch()}
              disabled={searching || !query.trim()}
            >
              {searching ? 'Поиск…' : 'Найти'}
            </button>
          </div>

          {search && (
            <div className="space-y-5">
              <div className="border border-[#E5E1DC] bg-white/70 p-4">
                <p className="text-sm leading-relaxed text-[#211F1F]">{search.summary}</p>
                {search.insufficient && (
                  <p className="mt-2 text-xs text-[#8B1E3F]">
                    В архиве недостаточно подтверждающих данных для уверенного ответа.
                  </p>
                )}
              </div>

              {search.facts.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle title="Подтверждающие факты" />
                  {search.facts.map((fact, index) => (
                    <article
                      key={`${fact.documentId}-${index}`}
                      className="border-l-2 border-[#990F3D] pl-4"
                    >
                      <p className="text-sm">{fact.text}</p>
                      <p className="mt-1 text-[10px] text-[#89827B]">
                        {fact.title} · {fact.outlet}
                      </p>
                    </article>
                  ))}
                </section>
              )}

              {search.interpretation.length > 0 && (
                <section className="space-y-2">
                  <SectionTitle title="Интерпретация" />
                  {search.interpretation.map((item, index) => (
                    <p key={index} className="text-xs leading-relaxed text-[#746D66]">
                      {item}
                    </p>
                  ))}
                </section>
              )}

              <section className="space-y-3">
                <SectionTitle title="Публикации и фрагменты" />
                {search.results.length === 0 ? (
                  <Empty>Ничего не найдено.</Empty>
                ) : (
                  search.results.map((hit) => (
                    <article
                      key={`${hit.documentId}-${hit.chunkId}`}
                      className="border border-[#E5E1DC] bg-white/70 p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="font-serif text-lg">{hit.title}</p>
                          <p className="text-[10px] text-[#89827B]">
                            {hit.outlet} · {date(hit.publishedDate)} · {hit.language || '—'} ·{' '}
                            {hit.topic || '—'}
                          </p>
                        </div>
                        <span className="font-mono text-[10px] text-[#89827B]">
                          sim {hit.similarity.toFixed(3)}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-[#625D58]">
                        {hit.content.slice(0, 900)}
                      </p>
                      {hit.quotes.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {hit.quotes.slice(0, 3).map((quote) => (
                            <p key={quote.id} className="text-xs text-[#625D58]">
                              “{quote.quoteText}” · {quote.quoteType} · {quote.verificationStatus}
                            </p>
                          ))}
                        </div>
                      )}
                      {hit.canonicalUrl && (
                        <a
                          className="mt-3 inline-flex text-[10px] text-[#8B1E3F] underline"
                          href={hit.canonicalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Открыть оригинал
                        </a>
                      )}
                    </article>
                  ))
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#625D58]">
      <span>
        {total} · стр. {page} / {pages}
      </span>
      <button
        type="button"
        className="border border-[#D9D3CD] px-2 py-1 disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ←
      </button>
      <button
        type="button"
        className="border border-[#D9D3CD] px-2 py-1 disabled:opacity-40"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        →
      </button>
      <select
        className="border border-[#D9D3CD] bg-white px-2 py-1"
        value={pageSize}
        onChange={(event) => onPageSize(Number(event.target.value))}
      >
        {[10, 20, 50, 100].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
}
